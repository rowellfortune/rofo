/**
 * API settings come from Vite env vars (see .env.example).
 * Run `sst deploy` and copy its outputs. With no values set the app runs in demo mode on mock data.
 */
const e = (import.meta.env ?? {}) as ImportMetaEnv;

export const apiConfig = {
  region: e.VITE_AWS_REGION ?? 'us-east-1',
  userPoolId: e.VITE_USER_POOL_ID ?? '',
  userPoolClientId: e.VITE_USER_POOL_CLIENT_ID ?? '',
  identityPoolId: e.VITE_IDENTITY_POOL_ID ?? '',
  graphqlUrl: e.VITE_GRAPHQL_URL ?? '',
  cdnUrl: (e.VITE_CDN_URL ?? '').replace(/\/$/, ''),
};

/** True when every value needed to reach the backend is present. */
export const apiEnabled = Boolean(
  apiConfig.userPoolId && apiConfig.userPoolClientId && apiConfig.identityPoolId && apiConfig.graphqlUrl,
);
