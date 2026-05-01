import type { ApiEnv } from "./config/env.js";
import type { SupabaseServiceClient } from "./supabase/client.js";

export type ApiContext = {
  env: ApiEnv;
  supabase: SupabaseServiceClient;
};
