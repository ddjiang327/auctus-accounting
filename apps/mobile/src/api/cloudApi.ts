import * as SecureStore from 'expo-secure-store';
import type { LedgerData } from '../domain/models';
import { normalizeData } from '../storage/mobileStore';
import { CLOUD_API_URL, DEV_EMAIL, DEV_PASSWORD, SUPABASE_ANON_KEY, SUPABASE_URL } from './cloudConfig';

const TOKEN_KEY = 'auctus_access_token';
const REFRESH_KEY = 'auctus_refresh_token';
const BUSINESS_ID_KEY = 'auctus_cloud_business_id';

export interface BusinessSummary {
  id: string;
  name: string;
  currency: string;
  locale: string;
  role: 'owner' | 'admin' | 'bookkeeper' | 'viewer';
  settings?: {
    gstEnabled: boolean;
    basBasis: 'cash' | 'accrual';
  } | null;
}

type SupabaseSessionResponse = {
  access_token: string;
  refresh_token: string;
};

async function saveSession(body: SupabaseSessionResponse): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, body.access_token);
  await SecureStore.setItemAsync(REFRESH_KEY, body.refresh_token);
}

async function passwordGrant(body: Record<string, unknown>): Promise<SupabaseSessionResponse> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const body = await response.json() as { error_description?: string; message?: string };
    throw new Error(body.error_description || body.message || 'Sign in failed');
  }
  return response.json() as Promise<SupabaseSessionResponse>;
}

export async function signIn(email: string, password: string): Promise<void> {
  await saveSession(await passwordGrant({ email, password }));
}

export async function signUp(email: string, password: string): Promise<void> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const body = await response.json() as { error_description?: string; message?: string };
    throw new Error(body.error_description || body.message || 'Sign up failed');
  }
  const body = await response.json() as Partial<SupabaseSessionResponse>;
  if (body.access_token && body.refresh_token) {
    await saveSession({ access_token: body.access_token, refresh_token: body.refresh_token });
    return;
  }
  await signIn(email, password);
}

export async function devAutoSignIn(): Promise<boolean> {
  if (!DEV_EMAIL || !DEV_PASSWORD) return false;
  await signIn(DEV_EMAIL, DEV_PASSWORD);
  return true;
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!refreshToken) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) return null;
  const body = await response.json() as SupabaseSessionResponse;
  await saveSession(body);
  return body.access_token;
}

export async function signOut(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  await SecureStore.deleteItemAsync(BUSINESS_ID_KEY);
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getSelectedBusinessId(): Promise<string | null> {
  return SecureStore.getItemAsync(BUSINESS_ID_KEY);
}

export async function setSelectedBusinessId(id: string | null): Promise<void> {
  if (id) await SecureStore.setItemAsync(BUSINESS_ID_KEY, id);
  else await SecureStore.deleteItemAsync(BUSINESS_ID_KEY);
}

async function cloudRequest<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');
  let response: Response;
  try {
    response = await fetch(`${CLOUD_API_URL}${path}`, {
      ...options,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...options.headers,
      },
    });
  } catch (error) {
    throw new Error(error instanceof Error ? `Cannot reach Auctus API: ${error.message}` : 'Cannot reach Auctus API.');
  }
  if (response.status === 401 && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return cloudRequest<T>(path, options, false);
  }
  const text = await response.text();
  let body: unknown = {};
  try {
    body = text ? (JSON.parse(text) as unknown) : {};
  } catch {
    body = { message: text };
  }
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String((body as Record<string, unknown>).message)
        : text;
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return body as T;
}

export async function createBusiness(name: string): Promise<BusinessSummary> {
  const response = await cloudRequest<{ business: { id: string } }>('/v1/businesses', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  const businesses = await listBusinesses();
  const created = businesses.find((business) => business.id === response.business.id);
  if (!created) throw new Error('Business created but not found in workspace list.');
  return created;
}

export async function listBusinesses(): Promise<BusinessSummary[]> {
  const response = await cloudRequest<{ businesses: BusinessSummary[] }>('/v1/businesses');
  return response.businesses;
}

export async function loadLedger(businessId: string): Promise<LedgerData> {
  const response = await cloudRequest<{ ledger: LedgerData }>(`/v1/businesses/${businessId}/ledger`);
  return normalizeData(response.ledger);
}

export async function saveLedger(businessId: string, data: LedgerData): Promise<LedgerData> {
  const response = await cloudRequest<{ ledger: LedgerData }>(`/v1/businesses/${businessId}/restore`, {
    method: 'POST',
    body: JSON.stringify({ ledger: data }),
  });
  return normalizeData(response.ledger);
}
