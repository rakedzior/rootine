/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPEN_FOOD_FACTS_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
