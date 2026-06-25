import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
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
  if (!value) throw new Error(`${name} is required for inventory/payroll backup restore smoke tests.`);
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

function modal(page: Page, title: string): Locator {
  return page.locator('.sheet').filter({ has: page.getByRole('heading', { name: title }) });
}

async function waitForWrite(page: Page, urlPart: string, action: () => Promise<void>) {
  const responsePromise = page.waitForResponse((response) => (
    response.url().includes(urlPart)
    && ['POST', 'PATCH', 'PUT'].includes(response.request().method())
  ));
  await action();
  expect((await responsePromise).ok()).toBeTruthy();
}

async function createProduct(page: Page, name: string, sku: string) {
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await page.getByRole('button', { name: 'Products' }).click();
  await page.getByRole('button', { name: '+ Add Product' }).click();

  const sheet = modal(page, 'New Product');
  await sheet.getByLabel('Name *').fill(name);
  await sheet.getByLabel('SKU').fill(sku);
  await sheet.getByLabel('Cost Price').fill('12');
  await sheet.getByLabel('Sell Price').fill('30');
  await waitForWrite(page, '/products', async () => {
    await sheet.getByRole('button', { name: 'Save' }).click();
  });
  await expect(page.getByText(name)).toBeVisible();
}

async function receivePurchaseOrder(page: Page, productName: string, supplierName: string) {
  await page.getByRole('button', { name: 'Purchase Orders' }).click();
  await page.getByRole('button', { name: '+ New Purchase Order' }).click();

  const createSheet = modal(page, 'New Purchase Order');
  await createSheet.getByLabel('Supplier Name').fill(supplierName);
  await createSheet.getByLabel('Memo').fill('Inventory payroll backup restore smoke');
  await createSheet.locator('input[placeholder="Qty"]').fill('5');
  await createSheet.locator('input[placeholder="Unit cost"]').fill('12');
  await waitForWrite(page, '/purchase-orders', async () => {
    await createSheet.getByRole('button', { name: 'Create PO' }).click();
  });
  await waitForWrite(page, '/mark-sent', async () => {
    await page.getByRole('button', { name: 'Mark Sent' }).click();
  });
  await page.getByRole('button', { name: 'Receive' }).click();
  const receiveSheet = modal(page, 'Receive Stock');
  await expect(receiveSheet.getByText(productName)).toBeVisible();
  await waitForWrite(page, '/receive', async () => {
    await receiveSheet.getByRole('button', { name: 'Confirm Receipt' }).click();
  });
  await expect(page.getByText('Received')).toBeVisible();
}

async function createSaleMovement(page: Page, productName: string) {
  await page.getByRole('button', { name: 'Stock Levels' }).click();
  await expect(page.getByText(productName)).toBeVisible();
  await page.getByRole('button', { name: '+ Movement' }).click();

  const sheet = modal(page, 'Add Movement');
  await sheet.getByLabel('Type').selectOption('sale');
  await sheet.getByLabel('Quantity').fill('2');
  await sheet.getByLabel('Unit Cost').fill('12');
  await sheet.getByLabel('Memo').fill('Backup restore sale movement');
  await waitForWrite(page, '/inventory-movements', async () => {
    await sheet.getByRole('button', { name: 'Save' }).click();
  });
}

async function createEmployee(page: Page, name: string) {
  await page.getByRole('button', { name: 'Payroll', exact: true }).click();
  await page.getByRole('button', { name: '+ Add Employee' }).click();

  const sheet = modal(page, 'Add Employee');
  await sheet.getByLabel('Name *').fill(name);
  await sheet.getByLabel('Annual Salary').fill('78000');
  await sheet.getByLabel('Super Fund').fill('Backup Restore Super');
  await waitForWrite(page, '/employees', async () => {
    await sheet.getByRole('button', { name: 'Save' }).click();
  });
  await expect(page.getByText(name)).toBeVisible();
}

async function createFinalisedPayRun(page: Page, employeeName: string) {
  await page.getByRole('button', { name: 'Pay Runs' }).click();
  await page.getByRole('button', { name: '+ New Pay Run' }).click();
  const sheet = modal(page, 'New Pay Run');
  await expect(sheet.getByText(employeeName)).toBeVisible();
  await waitForWrite(page, '/pay-runs', async () => {
    await sheet.getByRole('button', { name: 'Finalise & Post' }).click();
  });
  await expect(page.getByText('Finalised')).toBeVisible();
}

async function recordPaygRemittance(page: Page) {
  await page.getByRole('button', { name: 'Remittances' }).click();
  const paygCard = page.locator('.remittance-card').filter({ hasText: 'PAYG Withholding Payable' });
  await paygCard.getByRole('button', { name: 'Record Remittance' }).click();
  const sheet = modal(page, 'Record Remittance');
  await sheet.getByLabel('Memo').fill('Backup restore PAYG remittance');
  await waitForWrite(page, '/remittances', async () => {
    await sheet.getByRole('button', { name: 'Save' }).click();
  });
  await expect(page.getByText('Backup restore PAYG remittance')).toBeVisible();
}

async function markStpSubmitted(page: Page, reference: string, employeeName: string) {
  await page.getByRole('button', { name: 'STP' }).click();
  await expect(page.getByText(employeeName)).toBeVisible();
  await page.getByRole('button', { name: 'Mark Submitted' }).click();
  const sheet = modal(page, 'Mark Pay Run Submitted');
  await sheet.getByLabel('Reference Number (optional)').fill(reference);
  await waitForWrite(page, '/stp-submissions', async () => {
    await sheet.getByRole('button', { name: 'Confirm Submitted' }).click();
  });
  await expect(page.getByText(reference)).toBeVisible();
}

async function downloadBackup(page: Page, testInfo: TestInfo, filename: string) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('h1', { hasText: 'Settings' })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Backup' }).click();
  const download = await downloadPromise;
  const target = testInfo.outputPath(filename);
  await download.saveAs(target);
  return target;
}

async function resetLedger(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('h1', { hasText: 'Settings' })).toBeVisible();
  await waitForWrite(page, '/reset', async () => {
    await page.getByRole('button', { name: /Reset Backend Ledger/i }).click();
  });
}

async function restoreBackup(page: Page, path: string, testInfo: TestInfo) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('h1', { hasText: 'Settings' })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  const restorePromise = page.waitForResponse((response) => (
    response.url().includes('/restore') && response.request().method() === 'POST'
  ));
  await page.setInputFiles('input[type="file"][accept*="json"]', path);
  const preRestoreDownload = await downloadPromise;
  await preRestoreDownload.saveAs(testInfo.outputPath('inventory-payroll-pre-restore.json'));
  expect((await restorePromise).ok()).toBeTruthy();
}

test.describe('Inventory and payroll backup restore cloud UI flows', () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('exports, resets, and restores inventory and payroll records', async ({ page }, testInfo) => {
    page.on('dialog', (dialog) => dialog.accept());

    const admin = adminClient();
    const runId = Date.now();
    const workspaceName = `Inventory Payroll Restore ${runId}`;
    const productName = `Restore Widget ${runId}`;
    const productSku = `REST-${runId}`;
    const supplierName = `Restore Supplier ${runId}`;
    const employeeName = `Restore Employee ${runId}`;
    const stpReference = `STP-RESTORE-${runId}`;
    let businessId: string | null = null;

    try {
      await authenticate(page);
      await createWorkspace(page, workspaceName);
      businessId = await currentWorkspaceId(page);
      expect(businessId).toBeTruthy();

      await createProduct(page, productName, productSku);
      await receivePurchaseOrder(page, productName, supplierName);
      await createSaleMovement(page, productName);
      await createEmployee(page, employeeName);
      await createFinalisedPayRun(page, employeeName);
      await recordPaygRemittance(page);
      await markStpSubmitted(page, stpReference, employeeName);

      const backupPath = await downloadBackup(page, testInfo, 'inventory-payroll-backup.json');
      const backupRaw = readFileSync(backupPath, 'utf8');
      expect(backupRaw).toContain(productName);
      expect(backupRaw).toContain(productSku);
      expect(backupRaw).toContain(supplierName);
      expect(backupRaw).toContain('Backup restore sale movement');
      expect(backupRaw).toContain(employeeName);
      expect(backupRaw).toContain('Backup restore PAYG remittance');
      expect(backupRaw).toContain(stpReference);

      await resetLedger(page);
      await page.getByRole('button', { name: 'Inventory', exact: true }).click();
      await page.getByRole('button', { name: 'Products' }).click();
      await expect(page.getByText(productName)).not.toBeVisible();
      await page.getByRole('button', { name: 'Payroll', exact: true }).click();
      await expect(page.getByText(employeeName)).not.toBeVisible();

      await restoreBackup(page, backupPath, testInfo);
      await page.getByRole('button', { name: 'Inventory', exact: true }).click();
      await page.getByRole('button', { name: 'Products' }).click();
      await expect(page.getByText(productName)).toBeVisible();
      await page.getByRole('button', { name: 'Movements' }).click();
      await expect(page.getByText('Backup restore sale movement')).toBeVisible();
      await page.getByRole('button', { name: 'Purchase Orders' }).click();
      await expect(page.getByText(supplierName)).toBeVisible();

      await page.getByRole('button', { name: 'Payroll', exact: true }).click();
      await expect(page.getByText(employeeName)).toBeVisible();
      await page.getByRole('button', { name: 'Pay Runs' }).click();
      await expect(page.getByText('Finalised')).toBeVisible();
      await page.getByRole('button', { name: 'Remittances' }).click();
      await expect(page.getByText('Backup restore PAYG remittance')).toBeVisible();
      await page.getByRole('button', { name: 'STP' }).click();
      await expect(page.getByText(stpReference)).toBeVisible();
    } finally {
      await cleanupWorkspace(admin, businessId);
    }
  });
});
