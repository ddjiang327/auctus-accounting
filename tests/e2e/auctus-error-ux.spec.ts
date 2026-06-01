import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readLocalEnv() {
  try {
    return Object.fromEntries(
      readFileSync(resolve(process.cwd(), 'apps/web/.env.local'), 'utf8')
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const index = line.indexOf('=');
          return [line.slice(0, index), line.slice(index + 1)];
        }),
    );
  } catch {
    return {} as Record<string, string>;
  }
}

const localEnv = readLocalEnv();
const testEmail = process.env.VITE_AUCTUS_DEV_EMAIL || localEnv.VITE_AUCTUS_DEV_EMAIL || 'test@auctus.app';
const testPassword = process.env.VITE_AUCTUS_DEV_PASSWORD || localEnv.VITE_AUCTUS_DEV_PASSWORD || '123456';

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

async function createErrorUxWorkspace(page: Page) {
  await authenticate(page);
  await createWorkspace(page, `Error UX ${Date.now()}`);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('h1', { hasText: 'Settings' })).toBeVisible();
}

test.describe('Auctus web recoverable error UX', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('shows a retryable banner when the API is unreachable', async ({ page }) => {
    await createErrorUxWorkspace(page);
    await page.route('**/v1/businesses/*/backup', (route) => route.abort('failed'));

    await page.getByRole('button', { name: 'Download Backup' }).click();

    await expect(page.getByText('Cannot reach the server. Check your connection and retry.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  test('returns to sign-in with a clear notice when the session expires', async ({ page }) => {
    await createErrorUxWorkspace(page);
    await page.route('**/v1/businesses/*/backup', (route) => route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'expired jwt' }),
    }));

    await page.getByRole('button', { name: 'Download Backup' }).click();

    await expect(page.locator('#auth-email')).toBeVisible();
    await expect(page.getByText('Session expired. Please sign in again.')).toBeVisible();
  });

  test('shows a permission message for forbidden actions', async ({ page }) => {
    await createErrorUxWorkspace(page);
    await page.route('**/v1/businesses/*/backup', (route) => route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'forbidden' }),
    }));

    await page.getByRole('button', { name: 'Download Backup' }).click();

    await expect(page.getByText('You do not have permission to perform this action.')).toBeVisible();
  });
});
