import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Env = Record<string, string>;

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

const testEmail = process.env.VITE_AUCTUS_DEV_EMAIL || webEnv.VITE_AUCTUS_DEV_EMAIL || 'test@auctus.app';
const testPassword = process.env.VITE_AUCTUS_DEV_PASSWORD || webEnv.VITE_AUCTUS_DEV_PASSWORD || '123456';
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || apiEnv.SUPABASE_URL || webEnv.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || apiEnv.SUPABASE_SERVICE_ROLE_KEY;

function requireEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required for disposable workspace smoke tests.`);
  return value;
}

function adminClient(): SupabaseClient {
  return createClient(
    requireEnv(supabaseUrl, 'SUPABASE_URL'),
    requireEnv(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );
}

async function authenticate(page: Page) {
  await page.goto('/');

  const cloudModeButton = page.getByRole('button', { name: /Sign in.*Cloud sync/i });
  if (await cloudModeButton.isVisible().catch(() => false)) {
    await cloudModeButton.click();
  }

  await page.locator('#auth-email')
    .or(page.getByText('Select a workspace'))
    .or(page.getByText('NET WORTH'))
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 });

  const ready = page.getByText('Select a workspace').or(page.getByRole('heading', { name: 'Home' }));
  if (await ready.isVisible().catch(() => false)) return;

  if (await page.getByRole('button', { name: 'Dev Auto-Login' }).isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Dev Auto-Login' }).click();
    await ready.first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
  }

  if (await ready.isVisible().catch(() => false)) return;

  if (await page.locator('#auth-email').isVisible().catch(() => false)) {
    await page.locator('#auth-email').fill(testEmail);
    await page.locator('#auth-password').fill(testPassword);
    await page.locator('form.auth-form').getByRole('button', { name: /^Sign In$/ }).click();
  }

  await expect(ready).toBeVisible();
}

async function openWorkspaceSelector(page: Page) {
  if (await page.getByText('Select a workspace').isVisible().catch(() => false)) return;
  await page.getByRole('button', { name: /Switch workspace/i }).click();
  await expect(page.getByText('Select a workspace')).toBeVisible();
}

async function createWorkspace(page: Page, name: string) {
  await openWorkspaceSelector(page);
  await page.getByRole('button', { name: /Create new workspace/i }).click();
  await page.getByLabel('New workspace name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.getByText(name)).toBeVisible();
}

async function currentWorkspaceId(page: Page) {
  return page.evaluate(() => localStorage.getItem('auctus_api_business_id'));
}

async function cleanupWorkspace(admin: SupabaseClient, businessId: string | null) {
  if (businessId) {
    await admin.from('businesses').delete().eq('id', businessId);
  }
}

async function addContact(page: Page, name: string) {
  await page.getByRole('button', { name: 'Contacts' }).click();
  await expect(page.locator('h1', { hasText: 'Contacts' })).toBeVisible();
  await page.getByRole('button', { name: 'Add Contact' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Save Contact' }).click();
  await expect(page.getByText(name)).toBeVisible();
}

async function editContact(page: Page, fromName: string, toName: string) {
  await page.getByRole('button', { name: 'Contacts' }).click();
  await expect(page.getByText(fromName)).toBeVisible();
  await page.getByRole('button', { name: new RegExp(fromName) }).click();
  await page.getByLabel('Name').fill(toName);
  await page.getByRole('button', { name: 'Save Contact' }).click();
  await expect(page.getByText(toName)).toBeVisible();
  await expect(page.getByText(fromName)).not.toBeVisible();
}

async function addAndArchiveCategory(page: Page, categoryName: string) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('h1', { hasText: 'Settings' })).toBeVisible();
  await page.getByRole('button', { name: /Manage Categories/i }).click();
  await expect(page.locator('.sheet').getByRole('heading', { name: 'Categories' })).toBeVisible();
  await page.getByLabel('Name').fill(categoryName);
  await page.getByRole('button', { name: 'Add Category' }).click();
  await expect(page.getByRole('button', { name: new RegExp(categoryName) })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(categoryName) }).click();
  await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible();
  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByRole('button', { name: new RegExp(categoryName) })).not.toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
}

async function downloadBackup(page: Page, testInfo: TestInfo, filename: string) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('h1', { hasText: 'Settings' })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Backup' }).click();
  const download = await downloadPromise;
  const target = testInfo.outputPath(filename);
  await download.saveAs(target);
  return target;
}

async function resetLedger(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('h1', { hasText: 'Settings' })).toBeVisible();
  const resetResponse = page.waitForResponse((response) => (
    response.url().includes('/reset') && response.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: /Reset Backend Ledger/i }).click();
  expect((await resetResponse).ok()).toBeTruthy();
}

async function restoreBackup(page: Page, path: string, testInfo: TestInfo) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('h1', { hasText: 'Settings' })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.setInputFiles('input[type="file"][accept*="json"]', path);
  const preRestoreDownload = await downloadPromise;
  await preRestoreDownload.saveAs(testInfo.outputPath('disposable-pre-restore.json'));
}

test.describe('Auctus disposable workspace lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('create, edit, archive, export, reset, and restore an isolated workspace', async ({ page }, testInfo) => {
    page.on('dialog', (dialog) => dialog.accept());

    const admin = adminClient();
    const runId = Date.now();
    const workspaceName = `Disposable Trial ${runId}`;
    const contactDraft = `DISPOSABLE_CONTACT_${runId}_DRAFT`;
    const contactFinal = `DISPOSABLE_CONTACT_${runId}_FINAL`;
    const categoryName = `DISPOSABLE_CATEGORY_${runId}`;
    let businessId: string | null = null;

    try {
      await authenticate(page);
      await createWorkspace(page, workspaceName);
      businessId = await currentWorkspaceId(page);
      expect(businessId).toBeTruthy();

      await addContact(page, contactDraft);
      await editContact(page, contactDraft, contactFinal);
      await addAndArchiveCategory(page, categoryName);

      const backupPath = await downloadBackup(page, testInfo, 'disposable-backup.json');
      const backupRaw = readFileSync(backupPath, 'utf8');
      expect(backupRaw).toContain(contactFinal);
      expect(backupRaw).toContain(categoryName);

      await resetLedger(page);
      await page.getByRole('button', { name: 'Contacts' }).click();
      await expect(page.getByText(contactFinal)).not.toBeVisible();

      await restoreBackup(page, backupPath, testInfo);
      await page.getByRole('button', { name: 'Contacts' }).click();
      await expect(page.getByText(contactFinal)).toBeVisible();
    } finally {
      await cleanupWorkspace(admin, businessId);
    }
  });
});
