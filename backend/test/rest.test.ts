/**
 * Photo upload access: group parsing and who may get an upload URL.
 * Uses fake AWS credentials. The URL is signed locally, nothing is sent to AWS.
 * Run: npm run test:backend
 */
process.env.AWS_ACCESS_KEY_ID = 'AKIAFAKEFAKEFAKE';
process.env.AWS_SECRET_ACCESS_KEY = 'fakesecretfakesecretfakesecret1234567890';
process.env.AWS_REGION = 'us-east-1';

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ddb } from '../lib/db';
import { handler } from '../rest/presign';
import { parseGroups } from '../utils/RestUtil';

const revoked = new Set<string>();
(ddb as any).send = async (cmd: any) => {
  if (cmd.constructor.name !== 'GetCommand') throw new Error('fake: unsupported');
  const pk: string = cmd.input.Key.pk;
  return { Item: pk.startsWith('REVOKED#') && revoked.has(pk.slice(8)) ? { pk } : undefined };
};

/** A request as API Gateway delivers it. Groups arrive as text. */
const event = (sub: string, groups: unknown) => ({
  body: JSON.stringify({ contentType: 'image/png' }),
  requestContext: { authorizer: { jwt: { claims: { sub, ...(groups === undefined ? {} : { 'cognito:groups': groups }) } } } },
}) as any;
const call = async (sub: string, groups: unknown) => {
  const res = await handler(event(sub, groups)) as { statusCode: number; body: string };
  return { status: res.statusCode, body: JSON.parse(res.body) };
};

test('group claims parse from every shape API Gateway can send', () => {
  assert.deepEqual(parseGroups('[Agent Admin]'), ['Agent', 'Admin']);
  assert.deepEqual(parseGroups('Agent'), ['Agent']);
  assert.deepEqual(parseGroups('[Client]'), ['Client']);
  assert.deepEqual(parseGroups('Agent,Admin'), ['Agent', 'Admin']);
  assert.deepEqual(parseGroups('[Agent, Admin]'), ['Agent', 'Admin']);
  assert.deepEqual(parseGroups(['Agent', 'Client']), ['Agent', 'Client']);
  for (const nothing of [undefined, null, '', '[]', 42, {}]) assert.deepEqual(parseGroups(nothing), []);
  assert.ok(!parseGroups('[SuperAgent]').includes('Agent')); // a similar name is not a match
});

test('only agents and admins get an upload URL', async () => {
  const ok = await call('u1', '[Client Agent]');
  assert.equal(ok.status, 200);
  assert.match(ok.body.data.key, /^listings\/u1\/[0-9a-f-]{36}\.png$/); // key is scoped to the user
  assert.equal((await call('root', '[Admin]')).status, 200);

  for (const groups of ['[Client]', undefined, '', '[SuperAgent]']) {
    const r = await call('buyer', groups);
    assert.equal(r.status, 403, `groups ${String(groups)} must be refused`);
    assert.match(r.body.error, /Agent access needed/);
  }
});

test('a revoked agent is refused even while their token still says Agent', async () => {
  revoked.add('gone');
  const r = await call('gone', '[Client Agent]');
  assert.equal(r.status, 403);
  assert.match(r.body.error, /revoked/);
  assert.equal((await call('fine', '[Client Agent]')).status, 200); // others are unaffected
  revoked.add('root'); // an admin is never blocked
  assert.equal((await call('root', '[Admin]')).status, 200);
});
