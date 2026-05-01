import { createServer } from "node:http";

import { loadEnv } from "./config/env.js";
import { handleRequest } from "./http/router.js";
import { createSupabaseServiceClient } from "./supabase/client.js";

const env = loadEnv();
const supabase = createSupabaseServiceClient(env);

const server = createServer((request, response) => {
  void handleRequest(request, response, {
    env,
    supabase,
  });
});

server.listen(env.port, env.host, () => {
  console.log(`Auctus API listening on http://${env.host}:${env.port}`);
});
