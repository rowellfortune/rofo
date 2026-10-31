/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Mapbox public access token (starts with pk.). Optional: the app falls back to a mock map. */
  readonly VITE_MAPBOX_TOKEN?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
