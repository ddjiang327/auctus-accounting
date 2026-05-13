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

  await expect(
    ready,
  ).toBeVisible();
}

async function openWorkspaceSelector(page: Page) {
  if (await page.getByText('Select a workspace').isVisible().catch(() => false)) return;
  await page.getByRole('button', { name: /Switch workspace/i }).click();
  await expect(page.getByText('Select a workspace')).toBeVisible();
}

async function ensureLedgerLoaded(page: Page) {
  if (await page.getByText('Select a workspace').isVisible().catch(() => false)) {
    const firstWorkspace = page.locator('.workspace-item').first();
    if (await firstWorkspace.isVisible().catch(() => false)) {
      await firstWorkspace.click();
    } else {
      await createWorkspace(page, `E2E Seed ${Date.now()}`);
      return;
    }
  }

  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.getByText('NET WORTH')).toBeVisible();
  await expect(page.getByText('Recent Transactions')).toBeVisible();
}

async function createWorkspace(page: Page, name: string) {
  await page.getByRole('button', { name: /Create new workspace/i }).click();
  await page.getByLabel('New workspace name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.getByText('NET WORTH')).toBeVisible();
  await expect(page.getByText(name)).toBeVisible();
  await expect(page.getByText('Set up the first entries for this workspace')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Transaction' })).toBeVisible();
  await expect(page.getByText('No transactions yet')).toBeVisible();
}

test.describe('Auctus web cloud smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('authenticates and loads a ledger dashboard', async ({ page }) => {
    await authenticate(page);
    await ensureLedgerLoaded(page);
  });

  test('creates a workspace and loads its seeded ledger', async ({ page }) => {
    await authenticate(page);
    await openWorkspaceSelector(page);

    const name = `E2E Workspace ${Date.now()}`;
    await createWorkspace(page, name);
  });

  test('keeps the selected workspace after reload', async ({ page }) => {
    await authenticate(page);
    await openWorkspaceSelector(page);

    const name = `E2E Persist ${Date.now()}`;
    await createWorkspace(page, name);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    await expect(page.getByText('NET WORTH')).toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
  });
});
