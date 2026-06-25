#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const roles = ['owner', 'admin', 'bookkeeper', 'viewer'];

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
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const apiEnv = readEnv('apps/api/.env.local');
const webEnv = readEnv('apps/web/.env.local');
const webUrl = process.env.AUCTUS_PRODUCTION_WEB_URL || 'https://auctus-web.netlify.app';
const apiUrl = process.env.AUCTUS_PRODUCTION_API_URL || 'https://auctus-api.vercel.app';
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || apiEnv.SUPABASE_URL || webEnv.VITE_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || apiEnv.SUPABASE_ANON_KEY || webEnv.VITE_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || apiEnv.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(
  requireValue(supabaseUrl, 'SUPABASE_URL'),
  requireValue(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } },
);
const anon = createClient(
  requireValue(supabaseUrl, 'SUPABASE_URL'),
  requireValue(anonKey, 'SUPABASE_ANON_KEY'),
  { auth: { persistSession: false } },
);

const runId = Date.now();
const password = `Auctus-production-role-${runId}!`;
const businessName = `Production Role Acceptance ${runId}`;
const contactName = `PRODUCTION_ROLE_CONTACT_${runId}`;
const transactionNote = `PRODUCTION_ROLE_TRANSACTION_${runId}`;
const users = [];
let businessId = '';
let page;
let browser;

async function cleanup() {
  const cleanupErrors = [];

  if (businessId) {
    const { error } = await admin.from('businesses').delete().eq('id', businessId);
    if (error) cleanupErrors.push(`delete workspace ${businessId}: ${error.message}`);
  }

  for (const user of users) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) cleanupErrors.push(`delete ${user.role} user ${user.id}: ${error.message}`);
  }

  if (cleanupErrors.length) {
    throw new Error(`Production role acceptance cleanup failed: ${cleanupErrors.join(' | ')}`);
  }
}

async function setup() {
  for (const role of roles) {
    const email = `auctus-production-role-${role}-${runId}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { smoke: 'production-role-acceptance', role },
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
  if (businessError || !business) throw new Error(businessError?.message ?? 'Failed to create production role workspace.');
  businessId = business.id;

  const { error: settingsError } = await admin.from('business_settings').insert({ business_id: businessId });
  if (settingsError) throw new Error(settingsError.message);

  const { error: membersError } = await admin.from('business_members').insert(
    users.map((user) => ({ business_id: businessId, user_id: user.id, role: user.role })),
  );
  if (membersError) throw new Error(membersError.message);
}

async function signIn(user) {
  await page.goto(webUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'networkidle' });
  const cloudModeButton = page.getByRole('button', { name: /Sign in.*Cloud Sync/i });
  if (await cloudModeButton.isVisible().catch(() => false)) {
    await cloudModeButton.click();
  }
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.locator('form.auth-form').getByRole('button', { name: /^Sign In$/ }).click();
  await page.getByText('Select a workspace').or(page.getByRole('heading', { name: 'Home' })).first().waitFor({ state: 'visible', timeout: 25_000 });
  await page.evaluate((id) => {
    localStorage.setItem('auctus_api_business_id', id);
  }, businessId);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Home' }).waitFor({ state: 'visible', timeout: 25_000 });
  await page.getByText(businessName).first().waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByText('NET WORTH').waitFor({ state: 'visible', timeout: 20_000 });
}

async function clickNav(name) {
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
}

async function waitForHeading(name) {
  await page.getByRole('heading', { name }).first().waitFor({ state: 'visible', timeout: 20_000 });
}

async function expectBackupStatus(user, expectedStatus) {
  const { data, error } = await anon.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error || !data.session) throw new Error(error?.message ?? `${user.role} API sign-in failed.`);
  const response = await fetch(`${apiUrl}/v1/businesses/${businessId}/backup`, {
    headers: { authorization: `Bearer ${data.session.access_token}` },
  });
  if (response.status !== expectedStatus) {
    throw new Error(`${user.role} backup request returned ${response.status}, expected ${expectedStatus}.`);
  }
}

async function verifyAdminRole(role) {
  const user = users.find((item) => item.role === role);
  if (!user) throw new Error(`Missing ${role} user.`);
  await signIn(user);

  await clickNav('Settings');
  await waitForHeading('Settings');
  for (const expected of ['Track GST', 'Period Lock', 'Manage Categories', businessName, 'Download Backup', 'Restore Backup', 'Reset Backend Ledger']) {
    await page.getByText(expected).first().waitFor({ state: 'visible', timeout: 20_000 });
  }

  await clickNav('Accounts');
  await waitForHeading('Accounts');
  for (const expected of ['Add', 'Bank Feed', 'Reconcile']) {
    await page.getByRole('button', { name: expected }).waitFor({ state: 'visible', timeout: 20_000 });
  }

  await expectBackupStatus(user, 200);
}

async function verifyBookkeeper() {
  const bookkeeper = users.find((user) => user.role === 'bookkeeper');
  await signIn(bookkeeper);

  await clickNav('Contacts');
  await waitForHeading('Contacts');
  await page.getByRole('button', { name: 'Add Contact' }).click();
  await page.getByLabel('Name').fill(contactName);
  await page.getByRole('button', { name: 'Save Contact' }).click();
  await page.getByText(contactName).waitFor({ state: 'visible', timeout: 20_000 });

  await page.getByRole('button', { name: /New Transaction/i }).click();
  await page.getByRole('heading', { name: 'New Transaction' }).waitFor({ state: 'visible', timeout: 20_000 });
  const dialog = page.locator('.sheet').filter({ has: page.getByRole('heading', { name: 'New Transaction' }) });
  await dialog.getByLabel('Amount').fill('45.67');
  await dialog.getByLabel('Note').fill(transactionNote);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await clickNav('Activity');
  await waitForHeading('Activity');
  await page.getByText(transactionNote).waitFor({ state: 'visible', timeout: 20_000 });

  await clickNav('Settings');
  await waitForHeading('Settings');
  await page.getByText('Manage Categories').waitFor({ state: 'visible', timeout: 20_000 });
  for (const blocked of ['Track GST', 'Period Lock', 'Download Backup', 'Restore Backup', 'Reset Backend Ledger']) {
    if (await page.getByText(blocked).isVisible().catch(() => false)) {
      throw new Error(`Bookkeeper should not see ${blocked}.`);
    }
  }
}

async function verifyViewer() {
  const viewer = users.find((user) => user.role === 'viewer');
  await signIn(viewer);

  if (await page.getByRole('button', { name: /New Transaction/i }).isVisible().catch(() => false)) {
    throw new Error('Viewer should not see New Transaction.');
  }

  await clickNav('Activity');
  await waitForHeading('Activity');
  await page.getByText(transactionNote).waitFor({ state: 'visible', timeout: 20_000 });

  await clickNav('Contacts');
  await waitForHeading('Contacts');
  await page.getByText(contactName).waitFor({ state: 'visible', timeout: 20_000 });
  if (await page.getByRole('button', { name: 'Add Contact' }).isVisible().catch(() => false)) {
    throw new Error('Viewer should not see Add Contact.');
  }

  await clickNav('Accounts');
  await waitForHeading('Accounts');
  for (const blocked of ['Add', 'Bank Feed', 'Reconcile']) {
    if (await page.getByRole('button', { name: blocked }).isVisible().catch(() => false)) {
      throw new Error(`Viewer should not see ${blocked}.`);
    }
  }

  await clickNav('Settings');
  await waitForHeading('Settings');
  for (const blocked of ['Track GST', 'Period Lock', 'Manage Categories', 'Download Backup', 'Restore Backup', 'Reset Backend Ledger']) {
    if (await page.getByText(blocked).isVisible().catch(() => false)) {
      throw new Error(`Viewer should not see ${blocked}.`);
    }
  }

  await expectBackupStatus(viewer, 403);
}

try {
  await setup();
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
  page.on('dialog', (dialog) => dialog.accept());

  await verifyAdminRole('owner');
  await verifyAdminRole('admin');
  await verifyBookkeeper();
  await verifyViewer();

  console.log('Production role acceptance passed');
  console.log(`Web: ${webUrl}`);
  console.log(`API: ${apiUrl}`);
  console.log(`Temporary workspace: ${businessName}`);
  console.log('Verified: owner/admin management UI and backup 200, bookkeeper write/no-admin UI, viewer read-only UI and backup 403');
} finally {
  if (browser) await browser.close();
  await cleanup();
}
