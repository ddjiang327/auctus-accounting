import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Role = 'owner' | 'admin' | 'bookkeeper' | 'viewer';

type Env = Record<string, string>;

type TestUser = {
  id: string;
  email: string;
  password: string;
  role: Role;
};

function readEnvFile(path: string): Env {
  try {
    return Object.fromEntries(
      readFileSync(resolve(process.cwd(), path), 'utf8')
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const index = line.indexOf('=');
          return [line.slice(0, index), line.slice(index + 1)];
        }),
    );
  } catch {
    return {};
  }
}

const webEnv = readEnvFile('apps/web/.env.local');
const apiEnv = readEnvFile('apps/api/.env.local');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || apiEnv.SUPABASE_URL || webEnv.VITE_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || apiEnv.SUPABASE_ANON_KEY || webEnv.VITE_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || apiEnv.SUPABASE_SERVICE_ROLE_KEY;
const apiUrl = process.env.VITE_AUCTUS_API_URL || webEnv.VITE_AUCTUS_API_URL || 'http://127.0.0.1:4010';

function requireEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required for role UI smoke tests.`);
  return value;
}

function adminClient(): SupabaseClient {
  return createClient(
    requireEnv(supabaseUrl, 'SUPABASE_URL'),
    requireEnv(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );
}

function anonClient(): SupabaseClient {
  return createClient(
    requireEnv(supabaseUrl, 'SUPABASE_URL'),
    requireEnv(anonKey, 'SUPABASE_ANON_KEY'),
    { auth: { persistSession: false } },
  );
}

async function signInAs(page: Page, user: TestUser) {
  await page.addInitScript(() => {
    localStorage.setItem('auctus_disable_dev_auto_login', 'true');
  });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('auctus_disable_dev_auto_login', 'true');
  });
  const authResult = await page.evaluate(async ({ email, password }) => {
    const { supabase } = await import('/src/api/supabaseClient.ts');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    const { data } = await supabase.auth.getSession();
    return {
      error: error?.message ?? null,
      hasSession: Boolean(data.session),
      email: data.session?.user.email ?? null,
      storageKeys: Object.keys(localStorage),
    };
  }, { email: user.email, password: user.password });
  if (authResult.error || !authResult.hasSession || authResult.email !== user.email) {
    throw new Error(`Failed to sign in ${user.role}: ${authResult.error ?? `${authResult.email ?? 'no session'} ${authResult.storageKeys.join(',')}`}`);
  }
  await page.waitForTimeout(500);

  await page.reload();

  const ready = page.getByText('Select a workspace')
    .or(page.getByRole('heading', { name: 'Home' }))
    .first();
  await ready.waitFor({ state: 'visible', timeout: 15_000 }).catch(async (error) => {
    const state = await page.evaluate(async () => {
      const { supabase } = await import('/src/api/supabaseClient.ts');
      const { data } = await supabase.auth.getSession();
      return { keys: Object.keys(localStorage), hasSession: Boolean(data.session) };
    });
    throw new Error(`${error instanceof Error ? error.message : String(error)}; authState=${JSON.stringify(state)}`);
  });
}

async function setupRoleWorkspace(runId: number) {
  const admin = adminClient();
  const password = `Auctus-role-${runId}!`;
  const users: TestUser[] = [];
  const businessName = `Role UI ${runId}`;
  let businessId = '';

  try {
    for (const role of ['owner', 'admin', 'bookkeeper', 'viewer'] as Role[]) {
      const email = `auctus-role-${role}-${runId}@example.com`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { e2e: 'role-ui' },
      });
      if (error || !data.user) throw new Error(error?.message ?? `Failed to create ${role} user.`);
      users.push({ id: data.user.id, email, password, role });
    }

    const { error: profileError } = await admin.from('profiles').upsert(
      users.map((user) => ({ id: user.id, email: user.email })),
    );
    if (profileError) throw new Error(profileError.message);

    const { data: business, error: businessError } = await admin
      .from('businesses')
      .insert({ name: businessName })
      .select('id')
      .single();
    if (businessError || !business) throw new Error(businessError?.message ?? 'Failed to create role workspace.');
    businessId = business.id as string;

    const { error: settingsError } = await admin.from('business_settings').insert({ business_id: businessId });
    if (settingsError) throw new Error(settingsError.message);

    const { error: membersError } = await admin.from('business_members').insert(
      users.map((user) => ({ business_id: businessId, user_id: user.id, role: user.role })),
    );
    if (membersError) throw new Error(membersError.message);

    return { admin, businessId, businessName, users };
  } catch (error) {
    await cleanupRoleWorkspace(admin, businessId, users);
    throw error;
  }
}

async function cleanupRoleWorkspace(admin: SupabaseClient, businessId: string, users: TestUser[]) {
  if (businessId) {
    await admin.from('businesses').delete().eq('id', businessId);
  }

  for (const user of users) {
    await admin.auth.admin.deleteUser(user.id);
  }
}

async function openRoleWorkspace(page: Page, businessId: string, businessName: string) {
  await page.evaluate((id) => {
    localStorage.setItem('auctus_api_business_id', id);
  }, businessId);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.getByText(businessName).first()).toBeVisible();
  await expect(page.getByText('NET WORTH')).toBeVisible();
}

async function expectAdminUi(page: Page, businessName: string) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('h1', { hasText: 'Settings' })).toBeVisible();
  await expect(page.getByText('Track GST')).toBeVisible();
  await expect(page.getByText('Period Lock')).toBeVisible();
  await expect(page.getByText('Manage Categories')).toBeVisible();
  await expect(page.locator('h3', { hasText: 'Business' })).toBeVisible();
  await expect(page.getByText(businessName).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download Backup' })).toBeVisible();
  await expect(page.getByText('Restore Backup')).toBeVisible();
  await expect(page.getByText('Reset Backend Ledger')).toBeVisible();

  await page.getByRole('button', { name: 'Accounts' }).click();
  await expect(page.locator('h1', { hasText: 'Accounts' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bank Feed' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reconcile' })).toBeVisible();
}

async function expectBookkeeperUi(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('h1', { hasText: 'Settings' })).toBeVisible();
  await expect(page.getByText('Track GST')).not.toBeVisible();
  await expect(page.getByText('Period Lock')).not.toBeVisible();
  await expect(page.getByText('Business Profile')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Download Backup' })).not.toBeVisible();
  await expect(page.getByText('Restore Backup')).not.toBeVisible();
  await expect(page.getByText('Reset Backend Ledger')).not.toBeVisible();
  await expect(page.getByText('Manage Categories')).toBeVisible();

  await page.getByRole('button', { name: 'Contacts' }).click();
  await expect(page.locator('h1', { hasText: 'Contacts' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Contact' })).toBeVisible();

  await page.getByRole('button', { name: 'Accounts' }).click();
  await expect(page.locator('h1', { hasText: 'Accounts' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add' })).toBeVisible();
}

async function expectViewerUi(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('h1', { hasText: 'Settings' })).toBeVisible();
  await expect(page.getByText('Track GST')).not.toBeVisible();
  await expect(page.getByText('Period Lock')).not.toBeVisible();
  await expect(page.getByText('Manage Categories')).not.toBeVisible();
  await expect(page.getByText('Business Profile')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Download Backup' })).not.toBeVisible();
  await expect(page.getByText('Restore Backup')).not.toBeVisible();
  await expect(page.getByText('Reset Backend Ledger')).not.toBeVisible();

  await page.getByRole('button', { name: 'Contacts' }).click();
  await expect(page.locator('h1', { hasText: 'Contacts' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Contact' })).not.toBeVisible();

  await page.getByRole('button', { name: 'Accounts' }).click();
  await expect(page.locator('h1', { hasText: 'Accounts' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Bank Feed' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Reconcile' })).not.toBeVisible();
}

async function expectViewerBackupForbidden(viewer: TestUser, businessId: string) {
  const client = anonClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: viewer.email,
    password: viewer.password,
  });
  if (error || !data.session) throw new Error(error?.message ?? 'Viewer sign-in failed.');

  const response = await fetch(`${apiUrl}/v1/businesses/${businessId}/backup`, {
    headers: { authorization: `Bearer ${data.session.access_token}` },
  });
  expect(response.status).toBe(403);
}

test.describe('Auctus web real role UI permissions', () => {
  test('matches owner/admin/bookkeeper/viewer UI permissions and real viewer 403', async ({ page }) => {
    const runId = Date.now();
    const fixture = await setupRoleWorkspace(runId);

    try {
      for (const role of ['owner', 'admin'] as Role[]) {
        const user = fixture.users.find((item) => item.role === role);
        expect(user).toBeTruthy();
        await signInAs(page, user as TestUser);
        await openRoleWorkspace(page, fixture.businessId, fixture.businessName);
        await expectAdminUi(page, fixture.businessName);
      }

      const bookkeeper = fixture.users.find((item) => item.role === 'bookkeeper');
      expect(bookkeeper).toBeTruthy();
      await signInAs(page, bookkeeper as TestUser);
      await openRoleWorkspace(page, fixture.businessId, fixture.businessName);
      await expectBookkeeperUi(page);

      const viewer = fixture.users.find((item) => item.role === 'viewer');
      expect(viewer).toBeTruthy();
      await signInAs(page, viewer as TestUser);
      await openRoleWorkspace(page, fixture.businessId, fixture.businessName);
      await expectViewerUi(page);
      await expectViewerBackupForbidden(viewer as TestUser, fixture.businessId);
    } finally {
      await cleanupRoleWorkspace(fixture.admin, fixture.businessId, fixture.users);
    }
  });
});
