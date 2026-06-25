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

  test('does not include archived categories in local AI context', async ({ page }) => {
    let requestSystemPrompt = '';
    await page.route('https://api.anthropic.com/v1/messages', async (route) => {
      const body = route.request().postDataJSON() as { system?: string };
      requestSystemPrompt = body.system || '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content: [
            {
              type: 'tool_use',
              id: 'toolu_active_context',
              name: 'parse_transaction',
              input: {
                type: 'expense',
                amount: 12,
                accountId: 'a1',
                categoryId: 'e_other',
                missingFields: [],
              },
            },
          ],
        }),
      });
    });

    await resetLocalApp(page);
    await page.evaluate(() => {
      const raw = localStorage.getItem('auctus_react_data_v1');
      if (!raw) throw new Error('Ledger data was not saved.');
      const ledger = JSON.parse(raw);
      ledger.categories.expense.push({
        id: 'e_archived_ai_context',
        name: 'Archived AI Context Category',
        icon: 'X',
        color: '#000000',
        archivedAt: '2026-06-01T00:00:00.000Z',
      });
      localStorage.setItem('auctus_react_data_v1', JSON.stringify(ledger));
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 15_000 });

    await page.getByTitle('AI Quick Entry').click();
    await page.locator('.ai-entry-textarea').fill('context check');
    await page.getByRole('button', { name: /Parse/i }).click();
    await expect(page.locator('.ai-entry-draft')).toContainText('$12.00');

    expect(requestSystemPrompt).toContain('Other');
    expect(requestSystemPrompt).not.toContain('Archived AI Context Category');
    expect(requestSystemPrompt).not.toContain('e_archived_ai_context');
  });

  test('opens credit note drafts with the correct entry mode', async ({ page }) => {
    await page.route('https://api.anthropic.com/v1/messages', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content: [
            {
              type: 'tool_use',
              id: 'toolu_credit_note_ai_entry',
              name: 'parse_transaction',
              input: {
                type: 'income',
                amount: 75,
                accountId: 'a1',
                categoryId: 'i_free',
                chartAccountId: 'coa_4010',
                entryMode: 'credit_note',
                gstMode: 'inc',
                creditNoteNo: 'CN-AI-7',
                note: 'Credit for overcharge',
                missingFields: [],
              },
            },
          ],
        }),
      });
    });

    await resetLocalApp(page);

    await page.getByTitle('AI Quick Entry').click();
    await page.locator('.ai-entry-textarea').fill('credit note for overcharge $75');
    await page.getByRole('button', { name: /Parse/i }).click();
    await expect(page.locator('.ai-entry-draft')).toContainText('credit_note');
    await expect(page.locator('.ai-entry-draft')).toContainText('CN-AI-7');
    await page.getByRole('button', { name: /Open in form/i }).click();

    const modal = page.locator('.sheet').filter({ hasText: 'New Transaction' });
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Sale' })).toHaveClass(/active/);
    await expect(modal.getByRole('button', { name: 'Credit Note' })).toHaveClass(/active/);
    await expect(modal.getByLabel('Amount')).toHaveValue('75');
    await expect(modal.getByRole('textbox', { name: 'Credit No.' })).toHaveValue('CN-AI-7');
    await expect(modal.getByLabel('Note')).toHaveValue('Credit for overcharge');
  });

  test('derives invoice due date from AI payment terms', async ({ page }) => {
    await page.route('https://api.anthropic.com/v1/messages', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content: [
            {
              type: 'tool_use',
              id: 'toolu_invoice_terms_ai_entry',
              name: 'parse_transaction',
              input: {
                type: 'income',
                amount: 500,
                date: '2026-06-10',
                accountId: 'a1',
                categoryId: 'i_free',
                entryMode: 'invoice',
                paymentTerms: 'net_30',
                invoiceNo: 'INV-AI-42',
                party: 'New Customer Pty Ltd',
                missingFields: [],
              },
            },
          ],
        }),
      });
    });

    await resetLocalApp(page);

    await page.getByTitle('AI Quick Entry').click();
    await page.locator('.ai-entry-textarea').fill('Invoice $500 net 30 on 2026-06-10');
    await page.getByRole('button', { name: /Parse/i }).click();

    const draft = page.locator('.ai-entry-draft');
    await expect(draft).toContainText('2026-06-10');
    await expect(draft).toContainText('2026-07-10');
    await expect(draft).toContainText('Terms');
    await expect(draft).toContainText('net_30');
    await expect(draft).toContainText('INV-AI-42');
    await expect(draft).toContainText('Fill in: contact');
    await expect(draft).toContainText('New Customer Pty Ltd');
    await page.getByRole('button', { name: /Open in form/i }).click();

    const modal = page.locator('.sheet').filter({ hasText: 'New Transaction' });
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Invoice' })).toHaveClass(/active/);
    await expect(modal.getByRole('textbox', { name: 'Invoice No.' })).toHaveValue('INV-AI-42');
    await expect(modal.getByRole('textbox', { name: 'Due Date' })).toHaveValue('2026-07-10');
  });
});
