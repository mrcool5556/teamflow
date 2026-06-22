/// <reference types="vite/client" />

declare const __TEAMFLOW_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
