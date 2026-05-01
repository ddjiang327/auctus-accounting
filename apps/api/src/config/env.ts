export type ApiEnv = {
  port: number;
  host: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  corsOrigin: string;
};

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const parsePort = (value: string | undefined): number => {
  if (!value) {
    return 4010;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }

  return port;
};

export const loadEnv = (): ApiEnv => ({
  port: parsePort(process.env.PORT),
  host: process.env.HOST ?? "127.0.0.1",
  supabaseUrl: requireEnv("SUPABASE_URL"),
  supabaseAnonKey: requireEnv("SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  corsOrigin: process.env.API_CORS_ORIGIN ?? "http://localhost:5173",
});
