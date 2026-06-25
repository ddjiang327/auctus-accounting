import { expect, test, type Locator, type Page } from '@playwright/test';

async function waitForHome(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('NET WORTH')).toBeVisible();
}

async function openView(page: Page, navLabel: string, expected: Locator) {
  await page.getByRole('button', { name: navLabel }).click();
  await expect(page.locator('.top-bar h2', { hasText: navLabel })).toBeVisible({ timeout: 15_000 });
  await expect(expected.first()).toBeVisible();
}

test.describe('Auctus web lazy-loaded navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('loads every primary local-mode view after bundle splitting', async ({ page }) => {
    await waitForHome(page);

    await openView(page, 'Activity', page.getByText('All Transactions'));
    await openView(page, 'Sales', page.getByRole('button', { name: 'New Invoice' }));
    await openView(page, 'Purchases', page.getByRole('button', { name: 'New Bill' }));
    await openView(page, 'Contacts', page.getByRole('button', { name: 'Add Contact' }));
    await openView(page, 'Accounts', page.getByText('Chart of Accounts'));
    await openView(page, 'Inventory', page.getByRole('button', { name: 'Products' }));
    await openView(page, 'Payroll', page.getByRole('button', { name: '+ Add Employee' }));
    await openView(page, 'Reports', page.getByText('BAS Summary'));
    await page.getByRole('button', { name: 'Assets' }).click();
    await expect(page.locator('.top-bar h2', { hasText: 'Assets' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('h1', { hasText: 'Fixed Assets' })).toBeVisible();
    await page.getByRole('button', { name: 'Journals' }).click();
    await expect(page.locator('.top-bar h2', { hasText: 'Journals' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('h1', { hasText: 'Journals / Audit' })).toBeVisible();
    await openView(page, 'Settings', page.getByText('Track GST'));
    await page.getByRole('button', { name: 'Home' }).click();
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('NET WORTH')).toBeVisible();
  });
});
