import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
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
  await expect(page.getByText(name)).toBeVisible();
}

async function currentWorkspaceId(page: Page) {
  return page.evaluate(() => localStorage.getItem('auctus_api_business_id'));
}

async function selectWorkspaceById(page: Page, businessId: string | null, expectedName: string) {
  expect(businessId).toBeTruthy();
  await page.evaluate((id) => {
    localStorage.setItem('auctus_api_business_id', id);
  }, businessId);
  await page.reload();
  await expect(page.getByText(expectedName)).toBeVisible();
}

async function addContactMarker(page: Page, marker: string) {
  await page.getByRole('button', { name: 'Contacts' }).click();
  await expect(page.locator('h1', { hasText: 'Contacts' })).toBeVisible();
  await page.getByRole('button', { name: 'Add Contact' }).click();
  await page.getByLabel('Name').fill(marker);
  await page.getByRole('button', { name: 'Save Contact' }).click();
  await expect(page.getByText(marker)).toBeVisible();
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

async function restoreBackup(page: Page, path: string) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('h1', { hasText: 'Settings' })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.setInputFiles('input[type="file"][accept*="json"]', path);
  const preRestoreDownload = await downloadPromise;
  return preRestoreDownload;
}

test.describe('Auctus web cloud backup recovery', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('export → restore → pre-restore backup recovery (cloud)', async ({ page }, testInfo) => {
    page.on('dialog', (dialog) => dialog.accept());

    await authenticate(page);

    const runId = Date.now();
    const workspaceA = `Recovery Smoke ${runId} A`;
    const workspaceB = `Recovery Smoke ${runId} B`;
    const markerA = `RECOVERY_MARKER_${runId}_A`;
    const markerB = `RECOVERY_MARKER_${runId}_B`;

    await createWorkspace(page, workspaceA);
    const workspaceAId = await currentWorkspaceId(page);
    console.log(`[recovery] workspace A: ${workspaceA} id=${workspaceAId}`);

    await addContactMarker(page, markerA);

    const backupAPath = await downloadBackup(page, testInfo, 'backup-A.json');
    const backupARaw = readFileSync(backupAPath, 'utf8');
    expect(backupARaw).toContain(markerA);

    await createWorkspace(page, workspaceB);
    const workspaceBId = await currentWorkspaceId(page);
    console.log(`[recovery] workspace B: ${workspaceB} id=${workspaceBId}`);

    await addContactMarker(page, markerB);

    const backupBPath = await downloadBackup(page, testInfo, 'backup-B.json');
    const backupBRaw = readFileSync(backupBPath, 'utf8');
    expect(backupBRaw).toContain(markerB);
    expect(backupBRaw).not.toContain(markerA);

    await selectWorkspaceById(page, workspaceAId, workspaceA);
    await page.getByRole('button', { name: 'Contacts' }).click();
    await expect(page.getByText(markerA)).toBeVisible();

    const preRestoreDownload = await restoreBackup(page, backupBPath);
    const preRestorePath = testInfo.outputPath('pre-restore-A.json');
    await preRestoreDownload.saveAs(preRestorePath);
    const preRestoreRaw = readFileSync(preRestorePath, 'utf8');
    expect(preRestoreRaw).toContain(markerA);

    await page.getByRole('button', { name: 'Contacts' }).click();
    await expect(page.getByText(markerB)).toBeVisible();
    await expect(page.getByText(markerA)).not.toBeVisible();

    const invalidPath = testInfo.outputPath('invalid-backup.json');
    writeFileSync(invalidPath, '{"ledger":{bad json', 'utf8');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.setInputFiles('input[type="file"][accept*="json"]', invalidPath);
    await expect(page.getByText(/Restore failed/i)).toBeVisible();

    const preRestoreDownload2 = await restoreBackup(page, preRestorePath);
    await preRestoreDownload2.saveAs(testInfo.outputPath('pre-restore-B.json'));
    await page.getByRole('button', { name: 'Contacts' }).click();
    await expect(page.getByText(markerA)).toBeVisible();
    await expect(page.getByText(markerB)).not.toBeVisible();
  });
});
