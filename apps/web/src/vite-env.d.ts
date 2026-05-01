/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUCTUS_API_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_AUCTUS_DEV_EMAIL?: string;
  readonly VITE_AUCTUS_DEV_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
