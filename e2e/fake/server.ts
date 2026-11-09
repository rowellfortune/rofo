/**
 * The local stand-in for AWS used by the end to end tests. One process, one port (4600):
 *
 *   /cognito    Cognito user pool + identity pool (AWS JSON protocol). Playwright routes the browser's
 *               cognito-idp / cognito-identity requests here; the backend's AWS SDK calls come here directly.
 *   /graphql    AppSync. Checks the token, enforces the schema's auth directives, validates the query
 *               against backend/graphql/schema.graphql, then runs the REAL Lambda handler.
 *   /rest/...   API Gateway with a JWT authorizer, running the REAL presign handler.
 *   /s3/...     Accepts the presigned POST upload. /cdn/... serves the stored files.
 *   /map/...    A blank map style, so MapLibre renders without tile servers.
 *   /__test/... Controls for the tests: reset, create users, read emailed codes, seed listings.
 *
 * DynamoDB is dynalite (an in-memory implementation of the DynamoDB API) on port 4601,
 * so the backend's real queries, conditions and transactions run as written.
 *
 * Run: npx tsx e2e/fake/server.ts
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { CLIENT_ID, POOL_ID, REGION, addUser, getUser, handleCognito, lastCode, resetCognito } from './cognito';
import { verify } from './jwt';
import { proxyDynamo } from './dynamoTx';

export const PORT = Number(process.env.E2E_BACKEND_PORT ?? 4600);
const DDB_PORT = PORT + 1;
const BASE = `http://127.0.0.1:${PORT}`;
const TABLE = 'rofo-e2e-table';
const BUCKET = 'rofo-e2e-images';

// ---------------------------------------------------------------- environment for the real backend code
// Set before the handlers are imported, because the AWS SDK clients are created at import time.
Object.assign(process.env, {
  AWS_REGION: REGION,
  AWS_ACCESS_KEY_ID: 'e2e',
  AWS_SECRET_ACCESS_KEY: 'e2e',
  AWS_ENDPOINT_URL_DYNAMODB: `${BASE}/ddb`, // through the transaction proxy in dynamoTx.ts
  AWS_ENDPOINT_URL_COGNITO_IDENTITY_PROVIDER: `${BASE}/cognito`,
  AWS_ENDPOINT_URL_S3: `${BASE}/s3`,
  SST_RESOURCE_Table: JSON.stringify({ name: TABLE }),
  SST_RESOURCE_Images: JSON.stringify({ name: BUCKET }),
  SST_RESOURCE_App: JSON.stringify({ name: 'rofo', stage: 'e2e' }),
  USER_POOL_ID: POOL_ID,
  ALLOWED_ORIGIN: '*',
});

// Geocoding goes to Nominatim in production. Answer locally instead, with a fixed place.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith('https://nominatim.openstreetmap.org/')) {
    const q = new URL(url).searchParams.get('q') ?? '';
    const rows = /kerkplein/i.test(q)
      ? [{ display_name: 'Kerkplein 1, Paramaribo, Suriname', lat: '5.8262', lon: '-55.1563', address: { city: 'Paramaribo', country: 'Suriname' } }]
      : [];
    return new Response(JSON.stringify(rows), { headers: { 'content-type': 'application/json' } });
  }
  return realFetch(input, init);
}) as typeof fetch;

// ---------------------------------------------------------------- DynamoDB (dynalite)
// @ts-expect-error dynalite ships no types
const dynalite = (await import('dynalite')).default as unknown as (o: object) => { listen: (p: number, cb: (e?: Error) => void) => void };
await new Promise<void>((ok, fail) => dynalite({ createTableMs: 0, deleteTableMs: 0, updateTableMs: 0 }).listen(DDB_PORT, (e) => (e ? fail(e) : ok())));

const { DynamoDBClient, CreateTableCommand, DeleteTableCommand } = await import('@aws-sdk/client-dynamodb');
const admin = new DynamoDBClient({ endpoint: `http://127.0.0.1:${DDB_PORT}` }); // direct: the proxy is not listening yet

/** Same keys and indexes as infra/storage.ts. */
async function createTable() {
  const S = (n: string) => ({ AttributeName: n, AttributeType: 'S' as const });
  const gsi = (n: number) => ({
    IndexName: `gsi${n}`,
    KeySchema: [{ AttributeName: `gsi${n}pk`, KeyType: 'HASH' as const }, { AttributeName: `gsi${n}sk`, KeyType: 'RANGE' as const }],
    Projection: { ProjectionType: 'ALL' as const },
  });
  await admin.send(new CreateTableCommand({
    TableName: TABLE, BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: ['pk', 'sk', 'gsi1pk', 'gsi1sk', 'gsi2pk', 'gsi2sk', 'gsi3pk', 'gsi3sk'].map(S),
    KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }, { AttributeName: 'sk', KeyType: 'RANGE' }],
    GlobalSecondaryIndexes: [gsi(1), gsi(2), gsi(3)],
  }));
}
await createTable();

// ---------------------------------------------------------------- the real backend
const { handler: graphqlHandler } = await import('../../backend/graphql/handler');
const { handler: presignHandler } = await import('../../backend/rest/presign');
const { resetMfaCache } = await import('../../backend/lib/mfa');
const listings = await import('../../backend/lib/listings');

// ---------------------------------------------------------------- AppSync
const { buildSchema, graphql } = await import('graphql');
type FieldNode = import('graphql').GraphQLField<unknown, unknown>;

// AppSync's own scalars and directives are built in there; declare them so graphql-js can read the schema.
const schema = buildSchema(`
  scalar AWSDateTime
  scalar AWSEmail
  directive @aws_iam on OBJECT | FIELD_DEFINITION
  directive @aws_cognito_user_pools(cognito_groups: [String]) on OBJECT | FIELD_DEFINITION
  ${readFileSync(new URL('../../backend/graphql/schema.graphql', import.meta.url), 'utf8')}
`);

/** Who is calling: a verified Cognito token, an IAM signed request (guest), or nobody. */
type Auth = { kind: 'userPool'; claims: Record<string, any> } | { kind: 'iam' } | { kind: 'none' };
function authOf(req: IncomingMessage): Auth {
  const h = req.headers.authorization ?? '';
  if (h.startsWith('AWS4-HMAC-SHA256')) return { kind: 'iam' };
  const claims = h ? verify(h.replace(/^Bearer /, '')) : null;
  // AppSync accepts ID or access tokens issued for the app client.
  if (claims && (claims.aud === CLIENT_ID || claims.client_id === CLIENT_ID)) return { kind: 'userPool', claims };
  return { kind: 'none' };
}

/** AppSync's directive rules for a root field. Fields without auth directives use the default mode (user pools). */
function allowed(field: FieldNode, auth: Auth): boolean {
  const dirs = field.astNode?.directives ?? [];
  const iam = dirs.some((d) => d.name.value === 'aws_iam');
  const pool = dirs.find((d) => d.name.value === 'aws_cognito_user_pools');
  if (auth.kind === 'iam') return iam;
  if (auth.kind !== 'userPool') return false;
  if (!pool && iam) return false;
  const groupsArg = pool?.arguments?.find((a) => a.name.value === 'cognito_groups');
  if (!groupsArg || groupsArg.value.kind !== 'ListValue') return true;
  const need = groupsArg.value.values.map((v) => (v.kind === 'StringValue' ? v.value : ''));
  const have: string[] = auth.claims['cognito:groups'] ?? [];
  return need.some((g) => have.includes(g));
}

/** The identity object AppSync puts on the Lambda event. Claims are those of the token that was sent. */
const identityOf = (auth: Auth) => auth.kind === 'userPool'
  ? { sub: auth.claims.sub, claims: auth.claims, groups: auth.claims['cognito:groups'] ?? null, username: auth.claims['cognito:username'] ?? auth.claims.username, issuer: auth.claims.iss, sourceIp: ['127.0.0.1'], defaultAuthStrategy: 'ALLOW' }
  : auth.kind === 'iam' ? { accountId: '000000000000', cognitoIdentityId: 'guest', sourceIp: ['127.0.0.1'] } : null;

async function handleGraphql(req: IncomingMessage, body: { query: string; variables?: Record<string, unknown> }) {
  const auth = authOf(req);
  if (auth.kind === 'none') return { status: 401, body: { errors: [{ errorType: 'UnauthorizedException', message: 'Valid authorization header not provided.' }] } };

  // Every root field resolves through the one Lambda, exactly like the deployed Direct Lambda resolvers.
  const fieldResolver = async (_src: unknown, args: Record<string, unknown>, _ctx: unknown, info: import('graphql').GraphQLResolveInfo) => {
    if (info.parentType !== schema.getQueryType() && info.parentType !== schema.getMutationType()) {
      return (_src as Record<string, unknown>)?.[info.fieldName];
    }
    const field = info.parentType.getFields()[info.fieldName];
    if (!allowed(field, auth)) {
      throw Object.assign(new Error(`Not Authorized to access ${info.fieldName} on type ${info.parentType.name}`), { errorType: 'Unauthorized' });
    }
    // Round trip through JSON, like the Lambda boundary, so no Dates or class instances leak through.
    const args2 = JSON.parse(JSON.stringify(args));
    const out = await graphqlHandler({ arguments: args2, identity: identityOf(auth), info: { fieldName: info.fieldName, parentTypeName: info.parentType.name }, source: null, request: { headers: {} } } as never);
    return JSON.parse(JSON.stringify(out));
  };
  const res = await graphql({ schema, source: body.query, variableValues: body.variables ?? {}, fieldResolver });
  const errors = res.errors?.map((e) => ({ message: e.message, errorType: (e.originalError as { errorType?: string })?.errorType ?? 'GraphQLError', path: e.path }));
  return { status: 200, body: { data: res.data ?? null, ...(errors && { errors }) } };
}

// ---------------------------------------------------------------- uploads
const files = new Map<string, { type: string; bytes: Buffer }>();

/** API Gateway JWT authorizer: valid token for this client, then claims passed as text, groups as "[A B]". */
async function handlePresign(req: IncomingMessage, raw: Buffer) {
  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  const claims = verify(token);
  if (!claims || (claims.aud !== CLIENT_ID && claims.client_id !== CLIENT_ID)) return { status: 401, body: { message: 'Unauthorized' } };
  const groups: string[] = claims['cognito:groups'] ?? [];
  const event = {
    body: raw.toString(), headers: req.headers,
    requestContext: { authorizer: { jwt: { claims: { ...claims, 'cognito:groups': `[${groups.join(' ')}]` }, scopes: null } } },
  };
  const out = await presignHandler(event as never) as { statusCode: number; body: string };
  return { status: out.statusCode, body: JSON.parse(out.body) };
}

/** The presigned POST target. Checks the two conditions the presign sets: content type and size. */
async function handleS3Upload(req: IncomingMessage, raw: Buffer) {
  const form = await new Request('http://x', { method: 'POST', headers: req.headers as HeadersInit, body: new Uint8Array(raw) }).formData();
  const file = form.get('file');
  const key = String(form.get('key') ?? '');
  const type = String(form.get('Content-Type') ?? '');
  if (!(file instanceof Blob) || !key) return { status: 400, body: 'Bad upload' };
  if (file.type && file.type !== type) return { status: 403, body: 'Content-Type does not match the policy' };
  if (file.size < 1 || file.size > 8 * 1024 * 1024) return { status: 400, body: 'EntityTooLarge' };
  files.set(key, { type, bytes: Buffer.from(await file.arrayBuffer()) });
  return { status: 204, body: '' };
}

// ---------------------------------------------------------------- test controls
async function resetAll() {
  resetCognito();
  resetMfaCache();
  files.clear();
  await admin.send(new DeleteTableCommand({ TableName: TABLE })).catch(() => {});
  await createTable();
}

const BLANK_STYLE = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0d1117' } }] };

// ---------------------------------------------------------------- HTTP
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
  'access-control-expose-headers': 'x-amzn-requestid,x-amzn-errortype,x-amz-request-id',
};

function send(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}) {
  const isText = typeof body === 'string' || Buffer.isBuffer(body);
  res.writeHead(status, { ...CORS, ...(isText ? {} : { 'content-type': 'application/json' }), ...extra });
  res.end(isText ? body : JSON.stringify(body));
}

const readBody = (req: IncomingMessage) => new Promise<Buffer>((ok) => {
  const parts: Buffer[] = [];
  req.on('data', (c) => parts.push(c)).on('end', () => ok(Buffer.concat(parts)));
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', BASE);
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : url.pathname; // SDKs add a trailing slash
  if (req.method === 'OPTIONS') return send(res, 204, '');
  try {
    const raw = await readBody(req);
    const json = () => (raw.length ? JSON.parse(raw.toString()) : {});

    if (path === '/cognito') {
      const target = String(req.headers['x-amz-target'] ?? '');
      const out = handleCognito(target, json());
      return send(res, out.status, out.body, { 'content-type': 'application/x-amz-json-1.1', ...(out.type && { 'x-amzn-errortype': out.type }) });
    }
    if (path === '/ddb') {
      const out = await proxyDynamo(`http://127.0.0.1:${DDB_PORT}`, String(req.headers['x-amz-target'] ?? ''), raw.toString(), req.headers as Record<string, string>);
      res.writeHead(out.status, { 'content-type': 'application/x-amz-json-1.0' });
      return res.end(out.body);
    }
    if (path === '/graphql') { const out = await handleGraphql(req, json()); return send(res, out.status, out.body); }
    if (path === '/rest/uploads/presign') { const out = await handlePresign(req, raw); return send(res, out.status, out.body); }
    if (path.startsWith('/s3/')) { const out = await handleS3Upload(req, raw); return send(res, out.status, out.body); }
    if (path.startsWith('/cdn/')) {
      const f = files.get(decodeURIComponent(path.slice('/cdn/'.length)));
      return f ? send(res, 200, f.bytes, { 'content-type': f.type }) : send(res, 404, 'Not found');
    }
    if (path === '/map/style.json') return send(res, 200, BLANK_STYLE);

    // Test controls.
    if (path === '/__test/reset') { await resetAll(); return send(res, 200, { ok: true }); }
    if (path === '/__test/users') { const u = addUser(json()); return send(res, 200, { sub: u.sub, totpSecret: u.totpSecret }); }
    if (path === '/__test/user') {
      const u = getUser(url.searchParams.get('email') ?? '');
      return u ? send(res, 200, { sub: u.sub, groups: u.groups, totpEnabled: u.totpEnabled, totpSecret: u.totpSecret }) : send(res, 404, {});
    }
    if (path === '/__test/outbox') {
      const code = lastCode(url.searchParams.get('email') ?? '', (url.searchParams.get('kind') as 'signup' | 'reset') || undefined);
      return code ? send(res, 200, { code }) : send(res, 404, {});
    }
    if (path === '/__test/listings') {
      // Create listings through the real backend code, owned by an existing agent.
      const { agentEmail, items } = json() as { agentEmail: string; items: Record<string, unknown>[] };
      const u = getUser(agentEmail);
      if (!u) return send(res, 404, { error: 'unknown agent' });
      const caller = { sub: u.sub, email: u.email, name: u.name, groups: u.groups };
      const ids = [];
      for (const it of items) ids.push((await listings.createListing(caller, it) as { id: string }).id);
      return send(res, 200, { ids });
    }
    if (path === '/__test/health') return send(res, 200, { ok: true });
    return send(res, 404, { error: `No route for ${path}` });
  } catch (e) {
    console.error('[e2e backend]', path, e);
    return send(res, 500, { error: (e as Error).message });
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`[e2e backend] listening on ${BASE}`));
