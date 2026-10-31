/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional map style URL. Defaults to OpenFreeMap "liberty" (free, no key). */
  readonly VITE_MAP_STYLE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
