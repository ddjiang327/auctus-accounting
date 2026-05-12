import { loadEnv } from "../apps/api/dist/config/env.js";
import { handleRequest } from "../apps/api/dist/http/router.js";
import { createSupabaseServiceClient } from "../apps/api/dist/supabase/client.js";

let context;

function getContext() {
  if (!context) {
    const env = loadEnv();
    context = {
      env,
      supabase: createSupabaseServiceClient(env),
    };
  }

  return context;
}

function normalizeUrl(request) {
  const originalUrl = request.url ?? "/";
  request.url = originalUrl.replace(/^\/api(?=\/(?:health|v1)(?:[/?]|$))/, "") || "/";
}

export default async function handler(request, response) {
  normalizeUrl(request);
  await handleRequest(request, response, getContext());
}
