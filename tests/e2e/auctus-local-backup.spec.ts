import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function waitForHome(page: Page) {
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 15_000 });
}

async function addContact(page: Page, name: string) {
  await page.getByRole('button', { name: 'Contacts' }).click();
  await expect(page.locator('h1', { hasText: 'Contacts' })).toBeVisible();
  await page.getByRole('button', { name: 'Add Contact' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Save Contact' }).click();
  await expect(page.getByText(name)).toBeVisible();
}

test.describe('Auctus web local backup recovery', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('local backup download, restore, and pre-restore backup recovery', async ({ page }, testInfo) => {
    page.on('dialog', (dialog) => dialog.accept());

    await page.goto('/');
    await waitForHome(page);

    const runId = Date.now();
    const markerA = `LOCAL_MARKER_${runId}_A`;
    const markerB = `LOCAL_MARKER_${runId}_B`;

    // Add marker A so the backup will contain it
    await addContact(page, markerA);

    // Download backup A and verify it contains marker A
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.locator('h1', { hasText: 'Settings' })).toBeVisible();

    const backupAPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download Backup' }).click();
    const backupADl = await backupAPromise;
    const backupAPath = testInfo.outputPath('local-backup-A.json');
    await backupADl.saveAs(backupAPath);

    const backupARaw = readFileSync(backupAPath, 'utf8');
    expect(backupARaw).toContain(markerA);
    expect(backupARaw).not.toContain(markerB);

    // Add marker B — state now has both A and B
    await addContact(page, markerB);

    // Restore backup A: app downloads current state (A+B) as safety backup, then loads backup A (A only)
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.locator('h1', { hasText: 'Settings' })).toBeVisible();

    const preRestorePromise = page.waitForEvent('download');
    await page.setInputFiles('input[type="file"][accept*="json"]', backupAPath);
    const preRestoreDl = await preRestorePromise;
    const preRestorePath = testInfo.outputPath('local-pre-restore.json');
    await preRestoreDl.saveAs(preRestorePath);

    // Pre-restore backup must contain both markers (it was the state before restore)
    const preRestoreRaw = readFileSync(preRestorePath, 'utf8');
    expect(preRestoreRaw).toContain(markerA);
    expect(preRestoreRaw).toContain(markerB);

    // App should now reflect backup A: marker A visible, marker B gone
    await page.getByRole('button', { name: 'Contacts' }).click();
    await expect(page.getByText(markerA)).toBeVisible();
    await expect(page.getByText(markerB)).not.toBeVisible();

    // Restore from pre-restore backup to recover marker B
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.locator('h1', { hasText: 'Settings' })).toBeVisible();

    const recovery2Promise = page.waitForEvent('download');
    await page.setInputFiles('input[type="file"][accept*="json"]', preRestorePath);
    await recovery2Promise; // safety backup of the intermediate state (A only)

    // App should now reflect the pre-restore state: both A and B visible
    await page.getByRole('button', { name: 'Contacts' }).click();
    await expect(page.getByText(markerA)).toBeVisible();
    await expect(page.getByText(markerB)).toBeVisible();
  });
});
