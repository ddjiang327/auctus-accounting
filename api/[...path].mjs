import { loadEnv } from "../apps/api/dist/config/env.js";
import { handleRequest } from "../apps/api/dist/http/router.js";
import { createSupabaseServiceClient } from "../apps/api/dist/supabase/client.js";

let context;

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(body));
}

function applyHealthCors(request, response) {
  const allowedOrigin = process.env.API_CORS_ORIGIN ?? "*";
  response.setHeader("access-control-allow-origin", allowedOrigin);
  response.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  response.setHeader("access-control-allow-headers", "authorization,content-type");
  response.setHeader("vary", "origin");

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return true;
  }

  return false;
}

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

export function normalizeUrl(request) {
  const originalUrl = request.url ?? "/";
  request.url = originalUrl.replace(/^\/api(?=\/(?:health|v1)(?:[/?]|$))/, "") || "/";
}

export default async function handler(request, response) {
  normalizeUrl(request);
  if (request.url?.startsWith("/health")) {
    if (applyHealthCors(request, response)) {
      return;
    }

    sendJson(response, 200, {
      ok: true,
      service: "auctus-api",
    });
    return;
  }

  await handleRequest(request, response, getContext());
}
