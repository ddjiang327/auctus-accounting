import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { lookup } from 'node:dns/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Env = Record<string, string>;
type ApiOptions = {
  method?: string;
  body?: unknown;
  expectedStatus?: number;
};

function readEnvFile(path: string): Env {
  try {
    return Object.fromEntries(
      readFileSync(resolve(process.cwd(), path), 'utf8')
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const index = line.indexOf('=');
          return [line.slice(0, index), line.slice(index + 1)];
        }),
    );
  } catch {
    return {};
  }
}

const webEnv = readEnvFile('apps/web/.env.local');
const apiEnv = readEnvFile('apps/api/.env.local');

const testEmail = process.env.VITE_AUCTUS_DEV_EMAIL || webEnv.VITE_AUCTUS_DEV_EMAIL || 'test@auctus.app';
const testPassword = process.env.VITE_AUCTUS_DEV_PASSWORD || webEnv.VITE_AUCTUS_DEV_PASSWORD || '123456';
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || apiEnv.SUPABASE_URL || webEnv.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || apiEnv.SUPABASE_ANON_KEY || webEnv.VITE_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || apiEnv.SUPABASE_SERVICE_ROLE_KEY;
const apiUrl = process.env.VITE_AUCTUS_API_URL || webEnv.VITE_AUCTUS_API_URL || 'http://127.0.0.1:4010';

function requireEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required for inventory/payroll cloud API smoke tests.`);
  return value;
}

async function assertSupabaseHostResolves() {
  const url = new URL(requireEnv(supabaseUrl, 'SUPABASE_URL'));
  try {
    await lookup(url.hostname);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? ` (${String(error.code)})` : '';
    throw new Error(`Supabase host cannot be resolved${code}: ${url.hostname}. Check the Supabase project ref, project status, and local DNS/network before running cloud E2E tests.`);
  }
}

function adminClient(): SupabaseClient {
  return createClient(
    requireEnv(supabaseUrl, 'SUPABASE_URL'),
    requireEnv(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );
}

async function signInForToken(): Promise<string> {
  const client = createClient(
    requireEnv(supabaseUrl, 'SUPABASE_URL'),
    requireEnv(supabaseAnonKey, 'SUPABASE_ANON_KEY'),
    { auth: { persistSession: false } },
  );
  const { data, error } = await client.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });
  if (error || !data.session?.access_token) {
    throw new Error(error?.message ?? 'Failed to sign in test user.');
  }
  return data.session.access_token;
}

async function apiRequest<T>(token: string, path: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) as T : {} as T;
  const expectedStatus = options.expectedStatus ?? 200;
  expect(response.status, `${options.method ?? 'GET'} ${path}: ${text}`).toBe(expectedStatus);
  return body;
}

async function createWorkspace(token: string, name: string): Promise<string> {
  const response = await apiRequest<{ business: { id: string } }>(token, '/v1/businesses', {
    method: 'POST',
    body: { name },
    expectedStatus: 201,
  });
  return response.business.id;
}

async function cleanupWorkspace(admin: SupabaseClient, businessId: string | null) {
  if (businessId) {
    await admin.from('businesses').delete().eq('id', businessId);
  }
}

test.describe('Inventory and payroll cloud API flows', () => {
  test('persists granular inventory and payroll records in an isolated workspace', async () => {
    await assertSupabaseHostResolves();
    const admin = adminClient();
    const token = await signInForToken();
    const runId = Date.now();
    let businessId: string | null = null;

    try {
      businessId = await createWorkspace(token, `Inventory Payroll API ${runId}`);

      const initialLedger = await apiRequest<{
        ledger: {
          accounts: Array<{ id: string; name: string }>;
          categories: { expense: Array<{ id: string; name: string }> };
        };
      }>(token, `/v1/businesses/${businessId}/ledger`);
      const expenseCategoryId = initialLedger.ledger.categories.expense[0]?.id;
      expect(expenseCategoryId).toBeTruthy();

      const productId = `prod_${runId}`;
      const purchaseOrderId = `po_${runId}`;
      const receiptMovementId = `mov_receipt_${runId}`;
      const saleMovementId = `mov_sale_${runId}`;

      await apiRequest(token, `/v1/businesses/${businessId}/products`, {
        method: 'POST',
        body: {
          id: productId,
          name: `Cloud Widget ${runId}`,
          sku: `CW-${runId}`,
          unitOfMeasure: 'unit',
          costPrice: 10,
          sellPrice: 25,
          reorderPoint: 2,
        },
        expectedStatus: 201,
      });

      await apiRequest(token, `/v1/businesses/${businessId}/products/${productId}`, {
        method: 'PATCH',
        body: {
          id: productId,
          name: `Cloud Widget Updated ${runId}`,
          sku: `CWU-${runId}`,
          unitOfMeasure: 'unit',
          costPrice: 12,
          sellPrice: 30,
          reorderPoint: 3,
        },
      });

      const negativeStock = await apiRequest<{ error: string; message: string }>(token, `/v1/businesses/${businessId}/inventory-movements`, {
        method: 'POST',
        body: {
          id: `mov_negative_${runId}`,
          productId,
          date: '2026-06-01',
          type: 'sale',
          quantity: 1,
          unitCost: 12,
        },
        expectedStatus: 400,
      });
      expect(negativeStock).toMatchObject({ error: 'invalid_inventory_movement' });
      expect(negativeStock.message).toContain('Insufficient stock');

      await apiRequest(token, `/v1/businesses/${businessId}/purchase-orders`, {
        method: 'POST',
        body: {
          id: purchaseOrderId,
          date: '2026-06-01',
          expectedDate: '2026-06-03',
          supplierName: 'Cloud Supply Co',
          memo: 'Cloud inventory smoke',
          lines: [{ productId, orderedQty: 5, unitCost: 12, receivedQty: 0 }],
        },
        expectedStatus: 201,
      });
      await apiRequest(token, `/v1/businesses/${businessId}/purchase-orders/${purchaseOrderId}/mark-sent`, {
        method: 'POST',
      });
      await apiRequest(token, `/v1/businesses/${businessId}/purchase-orders/${purchaseOrderId}/receive`, {
        method: 'POST',
        body: {
          date: '2026-06-03',
          receiptQtys: { 0: 5 },
          movementId_0: receiptMovementId,
        },
      });
      await apiRequest(token, `/v1/businesses/${businessId}/inventory-movements`, {
        method: 'POST',
        body: {
          id: saleMovementId,
          productId,
          date: '2026-06-04',
          type: 'sale',
          quantity: 2,
          unitCost: 12,
        },
        expectedStatus: 201,
      });

      const bill = await apiRequest<{ transaction: { id: string } }>(token, `/v1/businesses/${businessId}/transactions`, {
        method: 'POST',
        body: {
          type: 'expense',
          amount: 60,
          categoryId: expenseCategoryId,
          date: '2026-06-05',
          gstMode: 'free',
          entryMode: 'invoice',
          party: 'Cloud Supply Co',
          paymentTerms: 'net_14',
          dueDate: '2026-06-19',
          docStatus: 'sent',
          note: 'Supplier bill for received PO',
        },
        expectedStatus: 201,
      });
      await apiRequest(token, `/v1/businesses/${businessId}/purchase-orders/${purchaseOrderId}/link-bill`, {
        method: 'POST',
        body: { billTransactionId: bill.transaction.id },
      });
      await apiRequest(token, `/v1/businesses/${businessId}/products/${productId}/archive`, {
        method: 'POST',
      });

      const employeeId = `emp_${runId}`;
      const payRunId = `payrun_${runId}`;
      const paySlipId = `payslip_${runId}`;
      const remittanceId = `rem_${runId}`;
      const stpSubmissionId = `stp_${runId}`;

      await apiRequest(token, `/v1/businesses/${businessId}/employees`, {
        method: 'POST',
        body: {
          id: employeeId,
          name: `Cloud Employee ${runId}`,
          payType: 'salary',
          payRate: 78000,
          payFrequency: 'fortnightly',
          taxFreeThreshold: true,
          employmentBasis: 'full_time',
          ordinaryHoursPerWeek: 38,
          casualLoadingRate: 0.25,
          superFundName: 'Cloud Super',
        },
        expectedStatus: 201,
      });
      await apiRequest(token, `/v1/businesses/${businessId}/employees/${employeeId}`, {
        method: 'PATCH',
        body: {
          id: employeeId,
          name: `Cloud Employee Updated ${runId}`,
          payType: 'salary',
          payRate: 80000,
          payFrequency: 'fortnightly',
          taxFreeThreshold: true,
          employmentBasis: 'full_time',
          ordinaryHoursPerWeek: 38,
          casualLoadingRate: 0.25,
          superFundName: 'Cloud Super',
        },
      });
      await apiRequest(token, `/v1/businesses/${businessId}/pay-runs`, {
        method: 'POST',
        body: {
          id: payRunId,
          periodStart: '2026-06-01',
          periodEnd: '2026-06-14',
          payDate: '2026-06-15',
          status: 'draft',
          createdAt: '2026-06-15T00:00:00.000Z',
          paySlips: [{
            id: paySlipId,
            employeeId,
            gross: 3000,
            paygWithheld: 700,
            superAmount: 345,
            netPay: 2300,
            hours: 76,
          }],
        },
        expectedStatus: 201,
      });
      await apiRequest(token, `/v1/businesses/${businessId}/pay-runs/${payRunId}/finalise`, {
        method: 'POST',
      });
      await apiRequest(token, `/v1/businesses/${businessId}/remittances`, {
        method: 'POST',
        body: {
          id: remittanceId,
          date: '2026-06-30',
          type: 'payg',
          amount: 700,
          memo: 'PAYG cloud smoke',
        },
        expectedStatus: 201,
      });
      await apiRequest(token, `/v1/businesses/${businessId}/stp-submissions`, {
        method: 'POST',
        body: {
          id: stpSubmissionId,
          payRunId,
          submittedAt: '2026-06-15T02:00:00.000Z',
          status: 'submitted',
          referenceNumber: `STP-${runId}`,
        },
        expectedStatus: 201,
      });
      await apiRequest(token, `/v1/businesses/${businessId}/employees/${employeeId}/archive`, {
        method: 'POST',
      });

      const finalLedger = await apiRequest<{
        ledger: {
          products: Array<{ id: string; archivedAt?: string }>;
          inventoryMovements: Array<{ id: string; productId: string; quantity: number; sourceId?: string }>;
          purchaseOrders: Array<{ id: string; status: string; billTransactionId?: string }>;
          employees: Array<{ id: string; archivedAt?: string }>;
          payRuns: Array<{ id: string; status: string; paySlips: Array<{ id: string }> }>;
          remittances: Array<{ id: string; amount: number }>;
          stpSubmissions: Array<{ id: string; payRunId: string }>;
        };
      }>(token, `/v1/businesses/${businessId}/ledger`);

      expect(finalLedger.ledger.products).toContainEqual(expect.objectContaining({ id: productId, archivedAt: expect.any(String) }));
      expect(finalLedger.ledger.inventoryMovements).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: receiptMovementId, productId, quantity: 5 }),
        expect.objectContaining({ id: saleMovementId, productId, quantity: 2 }),
      ]));
      expect(finalLedger.ledger.purchaseOrders).toContainEqual(expect.objectContaining({
        id: purchaseOrderId,
        status: 'received',
        billTransactionId: bill.transaction.id,
      }));
      expect(finalLedger.ledger.employees).toContainEqual(expect.objectContaining({ id: employeeId, archivedAt: expect.any(String) }));
      expect(finalLedger.ledger.payRuns).toContainEqual(expect.objectContaining({
        id: payRunId,
        status: 'finalised',
        paySlips: [expect.objectContaining({ id: paySlipId })],
      }));
      expect(finalLedger.ledger.remittances).toContainEqual(expect.objectContaining({ id: remittanceId, amount: 700 }));
      expect(finalLedger.ledger.stpSubmissions).toContainEqual(expect.objectContaining({ id: stpSubmissionId, payRunId }));
    } finally {
      await cleanupWorkspace(admin, businessId);
    }
  });
});
