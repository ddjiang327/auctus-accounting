import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "../config/env.js";
import { createSupabaseServiceClient } from "../supabase/client.js";
import { handleRequest } from "../http/router.js";
import type { ApiEnv } from "../config/env.js";
import type { SupabaseServiceClient } from "../supabase/client.js";

export type TestContext = {
  env: ApiEnv;
  supabase: SupabaseServiceClient;
  server: ReturnType<typeof createServer>;
  baseUrl: string;
  close: () => Promise<void>;
};

export async function startTestServer(): Promise<TestContext> {
  const env = loadEnv();
  const supabase = createSupabaseServiceClient(env);

  const server = createServer((request, response) => {
    void handleRequest(request, response, { env, supabase });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    env,
    supabase,
    server,
    baseUrl,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}

export async function createTestUser(
  env: ApiEnv,
  email: string,
  password: string,
): Promise<{ id: string; email: string }> {
  const adminClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    throw new Error(`Failed to create test user: ${error.message}`);
  }

  if (!data.user) {
    throw new Error("createUser returned no user");
  }

  return { id: data.user.id, email: data.user.email ?? email };
}

export async function deleteTestUser(env: ApiEnv, userId: string): Promise<void> {
  const adminClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) {
    console.error(`Failed to delete test user ${userId}:`, error.message);
  }
}

export async function getUserToken(env: ApiEnv, email: string, password: string): Promise<string> {
  const anonClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`Failed to sign in test user: ${error?.message ?? "no session"}`);
  }

  return data.session.access_token;
}

export async function createTestBusiness(
  supabase: SupabaseServiceClient,
  ownerId: string,
  name: string,
): Promise<{ id: string; name: string }> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: ownerId, email: `test-${ownerId}@auctus.app` })
    .select()
    .single();

  if (profileError) {
    throw new Error(`profile upsert failed: ${profileError.message}`);
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .insert({ name })
    .select("id,name")
    .single();

  if (businessError || !business) {
    throw new Error(`business create failed: ${businessError?.message ?? "no data"}`);
  }

  const { error: memberError } = await supabase.from("business_members").insert({
    business_id: business.id,
    user_id: ownerId,
    role: "owner",
  });

  if (memberError) {
    throw new Error(`member create failed: ${memberError.message}`);
  }

  const { error: settingsError } = await supabase.from("business_settings").insert({
    business_id: business.id,
  });

  if (settingsError) {
    throw new Error(`settings create failed: ${settingsError.message}`);
  }

  return business as { id: string; name: string };
}

export async function addBusinessMember(
  supabase: SupabaseServiceClient,
  businessId: string,
  userId: string,
  role: string,
): Promise<void> {
  const { error } = await supabase.from("business_members").insert({
    business_id: businessId,
    user_id: userId,
    role,
  });

  if (error) {
    throw new Error(`Failed to add member: ${error.message}`);
  }
}

export async function cleanupTestBusiness(supabase: SupabaseServiceClient, businessId: string): Promise<void> {
  // Delete in dependency order; some tables cascade, but we try to be thorough
  const tables = [
    "bank_reconciliations",
    "bank_feed_items",
    "manual_journal_lines",
    "manual_journals",
    "period_locks",
    "audit_log",
    "credit_allocations",
    "invoice_payments",
    "transactions",
    "contacts",
    "categories",
    "payment_accounts",
    "chart_accounts",
    "business_settings",
    "business_members",
  ];

  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq("business_id", businessId);
    if (error) {
      console.error(`Cleanup ${table} failed:`, error.message);
    }
  }

  const { error } = await supabase.from("businesses").delete().eq("id", businessId);
  if (error) {
    console.error(`Cleanup businesses failed:`, error.message);
  }
}

export async function apiRequest(
  baseUrl: string,
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let json: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }

  return { status: response.status, json };
}
