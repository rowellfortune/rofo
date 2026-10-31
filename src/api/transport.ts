import { apiConfig } from './config';

/** Error with a message safe to show to users. */
export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/** userPool = signed-in Cognito JWT. identityPool = IAM (works for guests, public queries only). */
export type AuthMode = 'userPool' | 'identityPool';

/** One GraphQL call. `field` is the root field, whose payload is { success, data, error }. */
export type Call = <T>(
  field: string,
  query: string,
  variables: Record<string, unknown>,
  mode: AuthMode,
) => Promise<T>;

type AmplifyAuth = typeof import('aws-amplify/auth');
interface Ready {
  client: { graphql: (opts: Record<string, unknown>) => Promise<unknown> };
  auth: AmplifyAuth;
}

let ready: Promise<Ready> | null = null;

/** Load and configure Amplify once. Dynamic imports keep it out of the demo bundle path. */
function init(): Promise<Ready> {
  ready ??= (async () => {
    const [{ Amplify }, { generateClient }, auth] = await Promise.all([
      import('aws-amplify'),
      import('aws-amplify/api'),
      import('aws-amplify/auth'),
    ]);
    Amplify.configure({
      Auth: {
        Cognito: {
          userPoolId: apiConfig.userPoolId,
          userPoolClientId: apiConfig.userPoolClientId,
          identityPoolId: apiConfig.identityPoolId,
          allowGuestAccess: true, // guests browse listings through the identity pool
        },
      },
      API: {
        GraphQL: { endpoint: apiConfig.graphqlUrl, region: apiConfig.region, defaultAuthMode: 'userPool' },
      },
    });
    return { client: generateClient() as unknown as Ready['client'], auth };
  })();
  return ready;
}

/** Amplify auth functions (sign in, sign up, session). */
export async function getAuth(): Promise<AmplifyAuth> {
  return (await init()).auth;
}

/** Real network call. Unwraps the { success, data, error } envelope and throws ApiError on failure. */
const realCall: Call = async <T,>(field: string, query: string, variables: Record<string, unknown>, mode: AuthMode) => {
  const { client } = await init();
  let res: { data?: Record<string, { success: boolean; data: T; error?: string } | null> };
  try {
    res = (await client.graphql({ query, variables, authMode: mode })) as typeof res;
  } catch (err) {
    const e = err as { errors?: { message?: string }[]; message?: string };
    throw new ApiError(e.errors?.[0]?.message ?? e.message ?? 'Request failed');
  }
  const payload = res.data?.[field];
  if (!payload) throw new ApiError('Empty response from server');
  if (!payload.success) throw new ApiError(payload.error ?? 'Request failed');
  return payload.data;
};

/** Swappable so tests can fake the network. */
export const transport: { call: Call } = { call: realCall };
