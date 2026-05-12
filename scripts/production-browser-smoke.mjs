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
let userId = '';
let businessId = '';
let page;
let browser;

async function cleanup() {
  if (!businessId) {
    const { data } = await admin
      .from('businesses')
      .select('id')
      .eq('name', businessName)
      .maybeSingle();
    businessId = data?.id ?? '';
  }

  if (businessId) {
    await admin.from('businesses').delete().eq('id', businessId);
  }

  if (userId) {
    await admin.auth.admin.deleteUser(userId);
  }
}

async function clickNav(name) {
  await page.getByRole('button', { name }).click();
}

async function waitForHeading(name) {
  await page.locator('h1', { hasText: name }).waitFor({ state: 'visible', timeout: 20_000 });
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
  const resetResponse = page.waitForResponse((response) => (
    response.url().includes('/reset') && response.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: /Reset Backend Ledger/i }).click();
  const response = await resetResponse;
  if (!response.ok()) {
    throw new Error(`Reset backend ledger failed with ${response.status()}.`);
  }
}

async function restoreBackup(path) {
  await clickNav('Settings');
  await waitForHeading('Settings');
  const downloadPromise = page.waitForEvent('download');
  await page.setInputFiles('input[type="file"][accept*="json"]', path);
  await downloadPromise;
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

  const backupPath = await downloadBackup('business-cycle');
  const backupRaw = readFileSync(backupPath, 'utf8');
  for (const marker of [contactName, categoryName, transactionNote]) {
    if (!backupRaw.includes(marker)) {
      throw new Error(`Production backup did not include expected marker: ${marker}`);
    }
  }

  await resetLedger();
  await clickNav('Activity');
  await waitForHeading('Activity');
  if (await page.getByText(transactionNote).isVisible().catch(() => false)) {
    throw new Error('Reset backend ledger did not remove the smoke transaction.');
  }

  await restoreBackup(backupPath);
  await clickNav('Activity');
  await waitForHeading('Activity');
  await page.getByText(transactionNote).waitFor({ state: 'visible', timeout: 20_000 });

  if (errors.length) {
    throw new Error(`Browser console errors: ${errors.join(' | ')}`);
  }

  console.log('Production browser smoke passed');
  console.log(`Web: ${webUrl}`);
  console.log(`Temporary user: ${email}`);
  console.log(`Temporary workspace: ${businessName}`);
  console.log('Verified: contact, category, transaction, backup download, reset, and restore');
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
