/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPEN_FOOD_FACTS_PROXY_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
