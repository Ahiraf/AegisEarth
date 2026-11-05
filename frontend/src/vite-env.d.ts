/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Which data source the app uses: "demo" (default), "snapshot" or "api". */
  readonly VITE_DATA_SOURCE?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
