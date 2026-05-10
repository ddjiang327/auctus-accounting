import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export const supabase = createClient(SUPABASE_URL || 'http://127.0.0.1', SUPABASE_ANON_KEY || 'anon', {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type AuthUser = {
  id: string;
  email: string;
};

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? '' };
}

export async function signInWithEmail(email: string, password: string) {
  if (!isSupabaseConfigured()) throw new Error('Supabase auth is not configured.');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUpWithEmail(email: string, password: string) {
  if (!isSupabaseConfigured()) throw new Error('Supabase auth is not configured.');
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
