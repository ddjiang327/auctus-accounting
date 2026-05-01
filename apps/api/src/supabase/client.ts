import { createClient } from "@supabase/supabase-js";

import type { ApiEnv } from "../config/env.js";

export const createSupabaseServiceClient = (env: ApiEnv) =>
  createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

export type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceClient>;
