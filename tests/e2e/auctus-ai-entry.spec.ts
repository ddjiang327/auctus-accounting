import { expect, test, type Page } from '@playwright/test';

async function resetLocalApp(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 15_000 });
}

test.describe('Auctus AI quick entry', () => {
  test('opens an AI draft in the transaction form without dropping parsed fields', async ({ page }) => {
    await page.route('https://api.anthropic.com/v1/messages', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'msg_test_ai_entry',
          type: 'message',
          role: 'assistant',
          model: 'claude-haiku-4-5-20251001',
          stop_reason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_test_ai_entry',
              name: 'parse_transaction',
              input: {
                type: 'expense',
                amount: 123.45,
                date: '2026-06-18',
                accountId: 'a2',
                categoryId: 'e_other',
                note: 'Officeworks printer paper',
                entryMode: 'cash',
                gstMode: 'inc',
                missingFields: [],
              },
            },
          ],
        }),
      });
    });

    await resetLocalApp(page);

    await page.getByTitle('AI Quick Entry').click();
    await expect(page.locator('.ai-entry-title', { hasText: 'AI Entry' })).toBeVisible();

    await page.locator('.ai-entry-textarea').fill('Bought Officeworks printer paper for $123.45 from Everyday Account on 2026-06-18');
    await page.getByRole('button', { name: /Parse/i }).click();

    await expect(page.locator('.ai-entry-draft')).toContainText('$123.45');
    await expect(page.locator('.ai-entry-draft')).toContainText('2026-06-18');
    await expect(page.locator('.ai-entry-draft')).toContainText('Everyday Account');
    await expect(page.locator('.ai-entry-draft')).toContainText('Other');
    await page.getByRole('button', { name: /Open in form/i }).click();

    const modal = page.locator('.sheet').filter({ hasText: 'New Transaction' });
    await expect(modal).toBeVisible();
    await expect(modal.getByLabel('Amount')).toHaveValue('123.45');
    await expect(modal.getByLabel('Date')).toHaveValue('2026-06-18');
    await expect(modal.getByLabel('Account')).toHaveValue('a2');
    await expect(modal.getByLabel('Category')).toHaveValue('e_other');
    await expect(modal.getByLabel('Note')).toHaveValue('Officeworks printer paper');
    await expect(modal.getByLabel('GST')).toHaveValue('inc');
  });

  test('normalizes invalid local AI draft fields before opening the form', async ({ page }) => {
    await page.route('https://api.anthropic.com/v1/messages', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content: [
            {
              type: 'tool_use',
              id: 'toolu_invalid_ai_entry',
              name: 'parse_transaction',
              input: {
                type: 'expense',
                amount: -10,
                date: 'bad-date',
                accountId: 'missing_account',
                categoryId: 'missing_category',
                chartAccountId: 'coa_4000',
                contactId: 'missing_contact',
                entryMode: 'unexpected',
                gstMode: 'unexpected',
                missingFields: [],
              },
            },
          ],
        }),
      });
    });

    await resetLocalApp(page);

    const today = new Date().toISOString().slice(0, 10);
    await page.getByTitle('AI Quick Entry').click();
    await page.locator('.ai-entry-textarea').fill('bad draft');
    await page.getByRole('button', { name: /Parse/i }).click();

    const draft = page.locator('.ai-entry-draft');
    await expect(draft).toContainText('Fill in: amount, account');
    await expect(draft).toContainText(today);
    await page.getByRole('button', { name: /Open in form/i }).click();

    const modal = page.locator('.sheet').filter({ hasText: 'New Transaction' });
    await expect(modal).toBeVisible();
    await expect(modal.getByLabel('Amount')).toHaveValue('0');
    await expect(modal.getByLabel('Date')).toHaveValue(today);
    await expect(modal.getByLabel('GST')).toHaveValue('inc');
  });
});
