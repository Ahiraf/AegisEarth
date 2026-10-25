/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Which data source the app uses: "demo" (default), "snapshot" or "api". */
  readonly VITE_DATA_SOURCE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
