import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: ['**/auctus-local-backup.spec.ts', '**/auctus-role-ui.spec.ts'],
    },
    {
      name: 'local-mode',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:5174' },
      testMatch: ['**/auctus-local-backup.spec.ts', '**/auctus-lazy-navigation.spec.ts'],
    },
    {
      name: 'role-ui',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:5173' },
      testMatch: '**/auctus-role-ui.spec.ts',
    },
  ],
  webServer: [
    {
      command: 'npm run build:api && npm run start -w apps/api',
      url: 'http://127.0.0.1:4010/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -w apps/web -- --host 127.0.0.1 --port 5173',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'VITE_SUPABASE_URL="" VITE_SUPABASE_ANON_KEY="" npm run dev -w apps/web -- --host 127.0.0.1 --port 5174',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
