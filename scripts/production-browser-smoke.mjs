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

  if (errors.length) {
    throw new Error(`Browser console errors: ${errors.join(' | ')}`);
  }

  console.log('Production browser smoke passed');
  console.log(`Web: ${webUrl}`);
  console.log(`Temporary user: ${email}`);
  console.log(`Temporary workspace: ${businessName}`);
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
