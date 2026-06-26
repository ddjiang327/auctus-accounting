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

  test('matches account and category labels from local AI output', async ({ page }) => {
    await page.route('https://api.anthropic.com/v1/messages', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content: [
            {
              type: 'tool_use',
              id: 'toolu_label_match_ai_entry',
              name: 'parse_transaction',
              input: {
                type: 'expense',
                amount: 49,
                date: '2026-06-19',
                accountId: 'Everyday Account',
                categoryId: 'Other',
                note: 'AI returned labels',
                missingFields: [],
              },
            },
          ],
        }),
      });
    });

    await resetLocalApp(page);

    await page.getByTitle('AI Quick Entry').click();
    await page.locator('.ai-entry-textarea').fill('Spent $49 from Everyday Account, other');
    await page.getByRole('button', { name: /Parse/i }).click();

    const draft = page.locator('.ai-entry-draft');
    await expect(draft).toContainText('Everyday Account');
    await expect(draft).toContainText('Other');
    await expect(draft).not.toContainText('Fill in');
    await page.getByRole('button', { name: /Open in form/i }).click();

    const modal = page.locator('.sheet').filter({ hasText: 'New Transaction' });
    await expect(modal).toBeVisible();
    await expect(modal.getByLabel('Account')).toHaveValue('a2');
    await expect(modal.getByLabel('Category')).toHaveValue('e_other');
    await expect(modal.getByLabel('Note')).toHaveValue('AI returned labels');
  });

  test('blocks incomplete local AI drafts from opening the form', async ({ page }) => {
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
    await expect(draft).toContainText('Fill in: amount, account, category');
    await expect(draft).toContainText('Can you confirm the amount, account, category?');
    await expect(draft).toContainText(today);
    await expect(page.getByRole('button', { name: /Open in form/i })).toBeDisabled();
    await expect(page.locator('.sheet').filter({ hasText: 'New Transaction' })).toHaveCount(0);
  });

  test('updates the same draft from a clarification answer', async ({ page }) => {
    let requestCount = 0;
    let clarificationPrompt = '';
    await page.route('https://api.anthropic.com/v1/messages', async (route) => {
      requestCount += 1;
      const body = route.request().postDataJSON() as { messages?: Array<{ content?: string }> };
      if (requestCount === 2) clarificationPrompt = body.messages?.[0]?.content || '';

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content: [
            {
              type: 'tool_use',
              id: `toolu_clarification_${requestCount}`,
              name: 'parse_transaction',
              input: requestCount === 1
                ? {
                    type: 'expense',
                    amount: 0,
                    date: '2026-06-18',
                    note: 'Officeworks printer paper',
                    entryMode: 'cash',
                    gstMode: 'inc',
                    missingFields: ['amount', 'account'],
                  }
                : {
                    amount: 123.45,
                    accountId: 'a2',
                    categoryId: 'e_other',
                    missingFields: [],
                  },
            },
          ],
        }),
      });
    });

    await resetLocalApp(page);

    await page.getByTitle('AI Quick Entry').click();
    await page.locator('.ai-entry-textarea').fill('Bought printer paper on 2026-06-18');
    await page.getByRole('button', { name: /Parse/i }).click();
    const draft = page.locator('.ai-entry-draft');
    await expect(draft).toContainText('Can you confirm the amount, account, category?');
    await expect(draft).toContainText('Officeworks printer paper');

    await page.locator('.ai-entry-textarea').fill('$123.45 from Everyday Account, category Other');
    await page.getByRole('button', { name: /Update draft/i }).click();

    expect(clarificationPrompt).toContain('Current draft JSON');
    expect(clarificationPrompt).toContain('Officeworks printer paper');
    expect(clarificationPrompt).toContain('User clarification');
    expect(clarificationPrompt).toContain('$123.45 from Everyday Account, category Other');

    await expect(draft).toContainText('$123.45');
    await expect(draft).toContainText('Everyday Account');
    await expect(draft).toContainText('Other');
    await expect(draft).not.toContainText('Fill in: amount');
    await page.getByRole('button', { name: /Open in form/i }).click();

    const modal = page.locator('.sheet').filter({ hasText: 'New Transaction' });
    await expect(modal).toBeVisible();
    await expect(modal.getByLabel('Amount')).toHaveValue('123.45');
    await expect(modal.getByLabel('Date')).toHaveValue('2026-06-18');
    await expect(modal.getByLabel('Account')).toHaveValue('a2');
    await expect(modal.getByLabel('Category')).toHaveValue('e_other');
    await expect(modal.getByLabel('Note')).toHaveValue('Officeworks printer paper');
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
    await expect(draft).toContainText('Can you confirm the contact?');
    await expect(draft).toContainText('New Customer Pty Ltd');
    await page.getByRole('button', { name: /Open in form/i }).click();

    const modal = page.locator('.sheet').filter({ hasText: 'New Transaction' });
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Invoice' })).toHaveClass(/active/);
    await expect(modal.getByRole('textbox', { name: 'Invoice No.' })).toHaveValue('INV-AI-42');
    await expect(modal.getByRole('textbox', { name: 'Due Date' })).toHaveValue('2026-07-10');
  });

  test('matches invoice party to a local contact and applies default terms', async ({ page }) => {
    await page.route('https://api.anthropic.com/v1/messages', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content: [
            {
              type: 'tool_use',
              id: 'toolu_invoice_contact_match_ai_entry',
              name: 'parse_transaction',
              input: {
                type: 'income',
                amount: 1200,
                date: '2026-06-12',
                accountId: 'a2',
                categoryId: 'i_free',
                entryMode: 'invoice',
                invoiceNo: 'INV-MATCH-9',
                party: 'Acme Studios',
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
      ledger.contacts.push({
        id: 'contact_acme_studios',
        type: 'customer',
        name: 'Acme Studios',
        email: 'accounts@acme.example',
        paymentTerms: 'net_14',
        createdAt: '2026-06-01T00:00:00.000Z',
      });
      ledger.contacts.push({
        id: 'contact_acme_supplier',
        type: 'supplier',
        name: 'Acme Studios',
        paymentTerms: 'net_60',
        createdAt: '2026-06-01T00:00:00.000Z',
      });
      localStorage.setItem('auctus_react_data_v1', JSON.stringify(ledger));
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 15_000 });

    await page.getByTitle('AI Quick Entry').click();
    await page.locator('.ai-entry-textarea').fill('Invoice Acme Studios $1200 on 2026-06-12');
    await page.getByRole('button', { name: /Parse/i }).click();

    const draft = page.locator('.ai-entry-draft');
    await expect(draft).toContainText('Acme Studios');
    await expect(draft).toContainText('net_14');
    await expect(draft).toContainText('2026-06-26');
    await expect(draft).not.toContainText('Fill in: contact');
    await page.getByRole('button', { name: /Open in form/i }).click();

    const modal = page.locator('.sheet').filter({ hasText: 'New Transaction' });
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Sale' })).toHaveClass(/active/);
    await expect(modal.getByRole('button', { name: 'Invoice' })).toHaveClass(/active/);
    await expect(modal.getByLabel('Customer')).toHaveValue('contact_acme_studios');
    await expect(modal.getByLabel('Terms')).toHaveValue('net_14');
    await expect(modal.getByRole('textbox', { name: 'Due Date' })).toHaveValue('2026-06-26');
    await expect(modal.getByRole('textbox', { name: 'Invoice No.' })).toHaveValue('INV-MATCH-9');
  });
});
