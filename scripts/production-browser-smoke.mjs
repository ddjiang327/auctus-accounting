#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function readEnv(path) {
  const target = resolve(root, path);
  if (!existsSync(target)) return {};
  return Object.fromEntries(
    readFileSync(target, 'utf8')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

function requireValue(value, name) {
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

const apiEnv = readEnv('apps/api/.env.local');
const webUrl = process.env.AUCTUS_PRODUCTION_WEB_URL || 'https://auctus-web.netlify.app';
const supabaseUrl = process.env.SUPABASE_URL || apiEnv.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || apiEnv.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(
  requireValue(supabaseUrl, 'SUPABASE_URL'),
  requireValue(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } },
);

const runId = Date.now();
const email = `auctus-production-smoke-${runId}@example.com`;
const password = `Auctus-production-${runId}!`;
const businessName = `Production Smoke ${runId}`;
const contactName = `PRODUCTION_SMOKE_CONTACT_${runId}`;
const categoryName = `PRODUCTION_SMOKE_CATEGORY_${runId}`;
const transactionNote = `PRODUCTION_SMOKE_TRANSACTION_${runId}`;
const productName = `PRODUCTION_SMOKE_PRODUCT_${runId}`;
const productSku = `PS-${runId}`;
const supplierName = `PRODUCTION_SMOKE_SUPPLIER_${runId}`;
const inventoryMovementMemo = `PRODUCTION_SMOKE_INVENTORY_MOVEMENT_${runId}`;
const employeeName = `PRODUCTION_SMOKE_EMPLOYEE_${runId}`;
const remittanceMemo = `PRODUCTION_SMOKE_PAYG_REMITTANCE_${runId}`;
const stpReference = `PRODUCTION_SMOKE_STP_${runId}`;
let userId = '';
let businessId = '';
let page;
let browser;

async function cleanup() {
  const cleanupErrors = [];

  if (!businessId) {
    const { data, error } = await admin
      .from('businesses')
      .select('id')
      .eq('name', businessName)
      .maybeSingle();
    if (error) cleanupErrors.push(`lookup workspace: ${error.message}`);
    businessId = data?.id ?? '';
  }

  if (businessId) {
    const { error } = await admin.from('businesses').delete().eq('id', businessId);
    if (error) cleanupErrors.push(`delete workspace ${businessId}: ${error.message}`);
  }

  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) cleanupErrors.push(`delete user ${userId}: ${error.message}`);
  }

  if (cleanupErrors.length) {
    throw new Error(`Production smoke cleanup failed: ${cleanupErrors.join(' | ')}`);
  }
}

async function clickNav(name) {
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
}

async function waitForHeading(name) {
  await page.getByRole('heading', { name }).first().waitFor({ state: 'visible', timeout: 20_000 });
}

async function waitForMarkerGone(marker, failureMessage) {
  try {
    await page.getByText(marker).waitFor({ state: 'hidden', timeout: 20_000 });
  } catch {
    throw new Error(failureMessage);
  }
}

function modal(title) {
  return page.locator('.sheet').filter({ has: page.getByRole('heading', { name: title }) });
}

async function waitForWrite(urlPart, action) {
  const responsePromise = page.waitForResponse((response) => (
    response.url().includes(urlPart)
    && ['POST', 'PATCH', 'PUT'].includes(response.request().method())
  ));
  await action();
  const response = await responsePromise;
  if (!response.ok()) {
    throw new Error(`${urlPart} write failed with ${response.status()}.`);
  }
}

async function addContact() {
  await clickNav('Contacts');
  await waitForHeading('Contacts');
  await page.getByRole('button', { name: 'Add Contact' }).click();
  await page.getByLabel('Name').fill(contactName);
  await page.getByRole('button', { name: 'Save Contact' }).click();
  await page.getByText(contactName).waitFor({ state: 'visible', timeout: 20_000 });
}

async function addCategory() {
  await clickNav('Settings');
  await waitForHeading('Settings');
  await page.getByRole('button', { name: /Manage Categories/i }).click();
  await page.locator('.sheet').getByRole('heading', { name: 'Categories' }).waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByLabel('Name').fill(categoryName);
  await page.getByRole('button', { name: 'Add Category' }).click();
  await page.getByRole('button', { name: new RegExp(categoryName) }).waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByRole('button', { name: 'Cancel' }).click();
}

async function addTransaction() {
  await page.getByRole('button', { name: /New Transaction/i }).click();
  await page.getByRole('heading', { name: 'New Transaction' }).waitFor({ state: 'visible', timeout: 20_000 });
  const dialog = page.locator('.sheet').filter({ has: page.getByRole('heading', { name: 'New Transaction' }) });
  await dialog.getByRole('button', { name: 'Purchase', exact: true }).click();
  await dialog.getByLabel('Amount').fill('123.45');
  const categorySelect = dialog.getByLabel('Category');
  const categoryValue = await categorySelect.locator('option', { hasText: categoryName }).getAttribute('value');
  if (!categoryValue) {
    throw new Error(`Could not find smoke category option: ${categoryName}`);
  }
  await categorySelect.selectOption(categoryValue);
  await dialog.getByLabel('Note').fill(transactionNote);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await clickNav('Activity');
  await waitForHeading('Activity');
  await page.getByText(transactionNote).waitFor({ state: 'visible', timeout: 20_000 });
}

async function addInventoryAndPayroll() {
  await clickNav('Inventory');
  await waitForHeading('Inventory');
  await page.getByRole('button', { name: 'Products' }).click();
  await page.getByRole('button', { name: '+ Add Product' }).click();
  let dialog = modal('New Product');
  await dialog.getByLabel('Name *').fill(productName);
  await dialog.getByLabel('SKU').fill(productSku);
  await dialog.getByLabel('Cost Price').fill('12');
  await dialog.getByLabel('Sell Price').fill('30');
  await waitForWrite('/products', async () => {
    await dialog.getByRole('button', { name: 'Save' }).click();
  });
  await page.getByText(productName).waitFor({ state: 'visible', timeout: 20_000 });

  await page.getByRole('button', { name: 'Purchase Orders' }).click();
  await page.getByRole('button', { name: '+ New Purchase Order' }).click();
  dialog = modal('New Purchase Order');
  await dialog.getByLabel('Supplier Name').fill(supplierName);
  await dialog.getByLabel('Memo').fill('Production inventory smoke');
  await dialog.locator('input[placeholder="Qty"]').fill('5');
  await dialog.locator('input[placeholder="Unit cost"]').fill('12');
  await waitForWrite('/purchase-orders', async () => {
    await dialog.getByRole('button', { name: 'Create PO' }).click();
  });
  await waitForWrite('/mark-sent', async () => {
    await page.getByRole('button', { name: 'Mark Sent' }).click();
  });
  await page.getByRole('button', { name: 'Receive' }).click();
  dialog = modal('Receive Stock');
  await dialog.getByText(productName).waitFor({ state: 'visible', timeout: 20_000 });
  await waitForWrite('/receive', async () => {
    await dialog.getByRole('button', { name: 'Confirm Receipt' }).click();
  });
  await page.getByText('Received', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 });

  await page.getByRole('button', { name: 'Stock Levels' }).click();
  await page.getByText(productName).waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByRole('button', { name: '+ Movement' }).click();
  dialog = modal('Add Movement');
  await dialog.getByLabel('Type').selectOption('sale');
  await dialog.getByLabel('Quantity').fill('2');
  await dialog.getByLabel('Unit Cost').fill('12');
  await dialog.getByLabel('Memo').fill(inventoryMovementMemo);
  await waitForWrite('/inventory-movements', async () => {
    await dialog.getByRole('button', { name: 'Save' }).click();
  });
  await page.getByRole('button', { name: 'Movements' }).click();
  await page.getByText(inventoryMovementMemo).waitFor({ state: 'visible', timeout: 20_000 });

  await clickNav('Payroll');
  await waitForHeading('Payroll');
  await page.getByRole('button', { name: '+ Add Employee' }).click();
  dialog = modal('Add Employee');
  await dialog.getByLabel('Name *').fill(employeeName);
  await dialog.getByLabel('Annual Salary').fill('78000');
  await dialog.getByLabel('Super Fund').fill('Production Smoke Super');
  await waitForWrite('/employees', async () => {
    await dialog.getByRole('button', { name: 'Save' }).click();
  });
  await page.getByText(employeeName).waitFor({ state: 'visible', timeout: 20_000 });

  await page.getByRole('button', { name: 'Pay Runs' }).click();
  await page.getByRole('button', { name: '+ New Pay Run' }).click();
  dialog = modal('New Pay Run');
  await dialog.getByText(employeeName).waitFor({ state: 'visible', timeout: 20_000 });
  await waitForWrite('/pay-runs', async () => {
    await dialog.getByRole('button', { name: 'Finalise & Post' }).click();
  });
  await page.getByText('Finalised').waitFor({ state: 'visible', timeout: 20_000 });

  await page.getByRole('button', { name: 'Remittances' }).click();
  const paygCard = page.locator('.remittance-card').filter({ hasText: 'PAYG Withholding Payable' });
  await paygCard.getByRole('button', { name: 'Record Remittance' }).click();
  dialog = modal('Record Remittance');
  await dialog.getByLabel('Memo').fill(remittanceMemo);
  await waitForWrite('/remittances', async () => {
    await dialog.getByRole('button', { name: 'Save' }).click();
  });
  await page.getByText(remittanceMemo).waitFor({ state: 'visible', timeout: 20_000 });

  await page.getByRole('button', { name: 'STP' }).click();
  await page.getByText(employeeName).waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByRole('button', { name: 'Mark Submitted' }).click();
  dialog = modal('Mark Pay Run Submitted');
  await dialog.getByLabel('Reference Number (optional)').fill(stpReference);
  await waitForWrite('/stp-submissions', async () => {
    await dialog.getByRole('button', { name: 'Confirm Submitted' }).click();
  });
  await page.getByText(stpReference).waitFor({ state: 'visible', timeout: 20_000 });
}

async function downloadBackup(name) {
  await clickNav('Settings');
  await waitForHeading('Settings');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Backup' }).click();
  const download = await downloadPromise;
  const target = `/tmp/auctus-production-smoke-${runId}-${name}.json`;
  await download.saveAs(target);
  return target;
}

async function resetLedger() {
  await clickNav('Settings');
  await waitForHeading('Settings');
  await waitForWrite('/reset', async () => {
    await page.getByRole('button', { name: /Reset Backend Ledger/i }).click();
  });
}

async function restoreBackup(path) {
  await clickNav('Settings');
  await waitForHeading('Settings');
  const downloadPromise = page.waitForEvent('download');
  const restoreResponse = page.waitForResponse((response) => (
    response.url().includes('/restore') && response.request().method() === 'POST'
  ));
  await page.setInputFiles('input[type="file"][accept*="json"]', path);
  await downloadPromise;
  const response = await restoreResponse;
  if (!response.ok()) {
    throw new Error(`Restore backup failed with ${response.status()}.`);
  }
}

try {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { smoke: 'production-browser' },
  });
  if (error || !data.user) {
    throw new Error(error?.message ?? 'Failed to create production smoke user.');
  }
  userId = data.user.id;

  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
  const errors = [];
  page.on('dialog', (dialog) => dialog.accept());
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(webUrl, { waitUntil: 'networkidle' });
  const cloudModeButton = page.getByRole('button', { name: /Sign in.*Cloud Sync/i });
  if (await cloudModeButton.isVisible().catch(() => false)) {
    await cloudModeButton.click();
  }
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.locator('form.auth-form').getByRole('button', { name: /^Sign In$/ }).click();
  await page.getByText('Select a workspace').waitFor({ state: 'visible', timeout: 20_000 });

  await page.getByRole('button', { name: /Create new workspace/i }).click();
  await page.getByLabel('New workspace name').fill(businessName);
  await page.locator('form.auth-form').getByRole('button', { name: /^Create$/ }).click();

  await page.getByRole('heading', { name: 'Home' }).waitFor({ state: 'visible', timeout: 45_000 });
  await page.getByText(businessName).first().waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByText('NET WORTH').waitFor({ state: 'visible', timeout: 20_000 });

  businessId = await page.evaluate(() => localStorage.getItem('auctus_api_business_id') || '');
  if (!businessId) {
    throw new Error('Production smoke workspace loaded, but selected business id was not stored.');
  }

  await addContact();
  await addCategory();
  await addTransaction();
  await addInventoryAndPayroll();

  const backupPath = await downloadBackup('business-cycle');
  const backupRaw = readFileSync(backupPath, 'utf8');
  for (const marker of [
    contactName,
    categoryName,
    transactionNote,
    productName,
    productSku,
    supplierName,
    inventoryMovementMemo,
    employeeName,
    remittanceMemo,
    stpReference,
  ]) {
    if (!backupRaw.includes(marker)) {
      throw new Error(`Production backup did not include expected marker: ${marker}`);
    }
  }

  await resetLedger();
  await clickNav('Activity');
  await waitForHeading('Activity');
  await waitForMarkerGone(transactionNote, 'Reset backend ledger did not remove the smoke transaction.');
  await clickNav('Inventory');
  await waitForHeading('Inventory');
  await page.getByRole('button', { name: 'Products' }).click();
  await waitForMarkerGone(productName, 'Reset backend ledger did not remove the smoke product.');
  await clickNav('Payroll');
  await waitForHeading('Payroll');
  await waitForMarkerGone(employeeName, 'Reset backend ledger did not remove the smoke employee.');

  await restoreBackup(backupPath);
  await clickNav('Activity');
  await waitForHeading('Activity');
  await page.getByText(transactionNote).waitFor({ state: 'visible', timeout: 20_000 });
  await clickNav('Inventory');
  await waitForHeading('Inventory');
  await page.getByRole('button', { name: 'Products' }).click();
  await page.getByText(productName).waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByRole('button', { name: 'Movements' }).click();
  await page.getByText(inventoryMovementMemo).waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByRole('button', { name: 'Purchase Orders' }).click();
  await page.getByText(supplierName).waitFor({ state: 'visible', timeout: 20_000 });
  await clickNav('Payroll');
  await waitForHeading('Payroll');
  await page.getByText(employeeName).waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByRole('button', { name: 'Pay Runs' }).click();
  await page.getByText('Finalised').waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByRole('button', { name: 'Remittances' }).click();
  await page.getByText(remittanceMemo).waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByRole('button', { name: 'STP' }).click();
  await page.getByText(stpReference).waitFor({ state: 'visible', timeout: 20_000 });

  if (errors.length) {
    throw new Error(`Browser console errors: ${errors.join(' | ')}`);
  }

  console.log('Production browser smoke passed');
  console.log(`Web: ${webUrl}`);
  console.log(`Temporary user: ${email}`);
  console.log(`Temporary workspace: ${businessName}`);
  console.log('Verified: contact, category, transaction, inventory, payroll, backup download, reset, and restore');
} finally {
  if (page) {
    const screenshotPath = `/tmp/auctus-production-smoke-${runId}.png`;
    if (!businessId) {
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
      const bodyText = await page.locator('body').innerText({ timeout: 1_000 }).catch(() => '');
      if (bodyText) {
        console.error(`Last visible page text:\n${bodyText.slice(0, 2_000)}`);
      }
      console.error(`Diagnostic screenshot: ${screenshotPath}`);
    }
  }

  if (browser) {
    await browser.close();
  }
  await cleanup();
}
