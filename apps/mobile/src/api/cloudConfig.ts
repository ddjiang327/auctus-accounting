export const CLOUD_API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const DEV_EMAIL = process.env.EXPO_PUBLIC_DEV_EMAIL ?? '';
export const DEV_PASSWORD = process.env.EXPO_PUBLIC_DEV_PASSWORD ?? '';

export function isCloudConfigured(): boolean {
  return Boolean(CLOUD_API_URL && SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function hasDevCredentials(): boolean {
  return Boolean(DEV_EMAIL && DEV_PASSWORD);
}
