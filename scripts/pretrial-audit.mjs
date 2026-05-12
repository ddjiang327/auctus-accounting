#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
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

function origin(value) {
  if (!value) return '';
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

function hasAny(env, keys) {
  return keys.some((key) => Boolean(env[key]));
}

const checks = [];

function pass(label, detail = '') {
  checks.push({ level: 'pass', label, detail });
}

function warn(label, detail = '') {
  checks.push({ level: 'warn', label, detail });
}

function fail(label, detail = '') {
  checks.push({ level: 'fail', label, detail });
}

const apiEnv = readEnv('apps/api/.env.local');
const webEnv = readEnv('apps/web/.env.local');
const apiExample = readEnv('apps/api/.env.example');
const webExample = readEnv('apps/web/.env.example');

if (existsSync(resolve(root, 'apps/api/.env.local'))) pass('API local env file exists', 'apps/api/.env.local');
else warn('API local env file is missing', 'Expected for local target-Supabase smoke tests.');

if (existsSync(resolve(root, 'apps/web/.env.local'))) pass('Web local env file exists', 'apps/web/.env.local');
else warn('Web local env file is missing', 'Expected for local target-Supabase smoke tests.');

const apiSupabase = apiEnv.SUPABASE_URL || '';
const webSupabase = webEnv.VITE_SUPABASE_URL || '';
if (apiSupabase && webSupabase && origin(apiSupabase) === origin(webSupabase)) {
  pass('API and Web point at the same Supabase project', origin(apiSupabase));
} else {
  fail('API and Web Supabase targets differ or are missing', `API=${origin(apiSupabase) || 'missing'} Web=${origin(webSupabase) || 'missing'}`);
}

if (apiEnv.SUPABASE_SERVICE_ROLE_KEY) pass('Service role key is present for local API only', 'Value is intentionally not printed.');
else fail('API service role key is missing locally', 'Backend backup/restore/reset and cleanup tests require it.');

if (webEnv.SUPABASE_SERVICE_ROLE_KEY || webEnv.VITE_SUPABASE_SERVICE_ROLE_KEY) {
  fail('Service role key appears in Web local env', 'Remove service role keys from browser-facing env.');
} else {
  pass('No service role key found in Web local env');
}

if (webExample.SUPABASE_SERVICE_ROLE_KEY || webExample.VITE_SUPABASE_SERVICE_ROLE_KEY) {
  fail('Service role key appears in Web env example', 'Do not document browser-facing service role keys.');
} else {
  pass('No service role key found in Web env example');
}

if (apiExample.SUPABASE_SERVICE_ROLE_KEY) pass('API env example documents server-only service role key');
else warn('API env example does not mention SUPABASE_SERVICE_ROLE_KEY');

if (hasAny(webEnv, ['VITE_AUCTUS_DEV_EMAIL', 'VITE_AUCTUS_DEV_PASSWORD'])) {
  warn('Web local env has dev auto-login credentials', 'Valid for local E2E only; do not set these in production.');
} else {
  pass('Web local env has no dev auto-login credentials');
}

const localApiOrigin = origin(webEnv.VITE_AUCTUS_API_URL || '');
const localCorsOrigin = origin(apiEnv.API_CORS_ORIGIN || '');
if (localApiOrigin && localCorsOrigin) {
  pass('Local Web API target and API CORS origin are configured', `Web API=${localApiOrigin}; CORS=${localCorsOrigin}`);
} else {
  warn('Local API URL or CORS origin is missing', 'Set VITE_AUCTUS_API_URL and API_CORS_ORIGIN before E2E.');
}

const deployFiles = ['vercel.json', 'render.yaml', 'fly.toml', 'netlify.toml']
  .filter((file) => existsSync(resolve(root, file)));
if (deployFiles.length) pass('Deployment config files found', deployFiles.join(', '));
else warn('No production deployment config found in repo', 'Record real Web/API hosts in docs/MVP_HARDENING.md before inviting users.');

const prodWeb = process.env.AUCTUS_PRODUCTION_WEB_URL || '';
const prodApi = process.env.AUCTUS_PRODUCTION_API_URL || '';
if (prodWeb && prodApi) {
  pass('Production Web/API URLs supplied to audit', `Web=${origin(prodWeb)} API=${origin(prodApi)}`);
} else {
  warn('Production Web/API URLs not supplied', 'Optional: set AUCTUS_PRODUCTION_WEB_URL and AUCTUS_PRODUCTION_API_URL when the deployment exists.');
}

try {
  const output = execFileSync('supabase', ['migration', 'list'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const lastMigration = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d{14}/.test(line))
    .at(-1);
  pass('Supabase migration list command passed', lastMigration || 'No migration rows parsed.');
} catch (error) {
  warn('Supabase migration list command failed', error.stderr?.toString().trim() || error.message);
}

console.log('Pre-trial audit\n');
for (const check of checks) {
  const marker = check.level === 'pass' ? 'PASS' : check.level === 'warn' ? 'WARN' : 'FAIL';
  console.log(`${marker} ${check.label}${check.detail ? ` - ${check.detail}` : ''}`);
}

const failures = checks.filter((check) => check.level === 'fail');
const warnings = checks.filter((check) => check.level === 'warn');
console.log(`\nSummary: ${checks.length - failures.length - warnings.length} passed, ${warnings.length} warnings, ${failures.length} failures.`);

if (failures.length) process.exit(1);
