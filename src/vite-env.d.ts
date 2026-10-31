/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend values from `sst deploy` outputs. Leave unset for demo mode. */
  readonly VITE_AWS_REGION?: string;
  readonly VITE_USER_POOL_ID?: string;
  readonly VITE_USER_POOL_CLIENT_ID?: string;
  readonly VITE_IDENTITY_POOL_ID?: string;
  readonly VITE_GRAPHQL_URL?: string;
  readonly VITE_CDN_URL?: string;
  /** Optional map style URL. Defaults to OpenFreeMap "liberty" (free, no key). */
  readonly VITE_MAP_STYLE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
