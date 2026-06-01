import type {
  Account,
  Category,
  ChartAccount,
  Contact,
  CreditAllocation,
  AuditLogEntry,
  BankFeedItem,
  BankReconciliation,
  InvoicePayment,
  LedgerData,
  ManualJournal,
  PeriodLock,
  Product,
  InventoryMovement,
  Employee,
  PayRun,
  PaySlip,
  Remittance,
  STPSubmission,
  PurchaseOrder,
  POLine,
  Transaction,
} from "@auctus/shared-types";

import { ApiError, type BusinessSummary } from "../businesses/service.js";
import type { SupabaseServiceClient } from "../supabase/client.js";
import { AccountingSeedError, seedAccountingFoundation } from "./seed.js";

type BusinessRow = {
  id: string;
  name: string;
  abn: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  logo_uri: string | null;
  logo_text: string | null;
  payment_instructions: string | null;
  invoice_footer: string | null;
  currency: string;
  locale: string;
  created_at: string;
};

type BusinessSettingsRow = {
  gst_enabled: boolean;
  gst_rate: number;
  bas_basis: "cash" | "accrual";
  invoice_prefix: string;
  bill_prefix: string;
  credit_note_prefix: string;
  supplier_credit_prefix: string;
  receipt_prefix: string;
  next_invoice_number: number;
  next_bill_number: number;
  next_credit_note_number: number;
  next_supplier_credit_number: number;
  next_receipt_number: number;
  inventory_state_version: number;
  payroll_state_version: number;
};

type MembershipRow = {
  role: BusinessSummary["role"];
  businesses: BusinessRow | null;
};

type ChartAccountRow = {
  id: string;
  code: string;
  name: string;
  class: ChartAccount["class"];
  group_name: string;
  normal_balance: ChartAccount["normalBalance"];
  is_contra: boolean;
};

type PaymentAccountRow = {
  id: string;
  name: string;
  type: Account["type"];
  init_balance: number;
  icon: string;
  color: string;
  chart_account_id: string;
};

type CategoryRow = {
  id: string;
  type: "income" | "expense";
  name: string;
  icon: string;
  color: string;
  chart_account_id: string | null;
  archived_at: string | null;
};

type ContactRow = {
  id: string;
  type: Contact["type"];
  name: string;
  abn: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  payment_terms: Contact["paymentTerms"] | null;
  created_at: string;
  archived_at: string | null;
};

type TransactionRow = {
  id: string;
  type: Transaction["type"];
  amount: number;
  payment_account_id: string | null;
  payment_account_to_id: string | null;
  category_id: string | null;
  chart_account_id: string | null;
  clearing_chart_account_id: string | null;
  date: string;
  note: string | null;
  gst_mode: Transaction["gstMode"];
  entry_mode: Transaction["entryMode"] | null;
  contact_id: string | null;
  party: string | null;
  invoice_no: string | null;
  credit_note_no: string | null;
  payment_terms: Transaction["paymentTerms"] | null;
  due_date: string | null;
  doc_status: Transaction["docStatus"] | null;
  voided_at: string | null;
  recurring_template_id: string | null;
  product_id: string | null;
  product_qty: number | null;
};

type InvoicePaymentRow = {
  id: string;
  transaction_id: string;
  amount: number;
  date: string;
  payment_account_id: string;
  receipt_no: string | null;
  receipt_created_at: string | null;
  voided_at: string | null;
};

type CreditAllocationRow = {
  id: string;
  credit_note_id: string;
  invoice_id: string;
  amount: number;
  date: string;
  voided_at: string | null;
};

type AuditLogRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  detail: string;
  created_at: string;
};

type PeriodLockRow = {
  id: string;
  locked_through: string;
  note: string | null;
  created_at: string;
};

type ManualJournalRow = {
  id: string;
  date: string;
  memo: string;
  created_at: string;
  updated_at: string | null;
  reversed_at: string | null;
  reversal_of: string | null;
  voided_at: string | null;
};

type ManualJournalLineRow = {
  manual_journal_id: string;
  chart_account_id: string;
  debit: number;
  credit: number;
  line_order: number;
};

type BankFeedItemRow = {
  id: string;
  payment_account_id: string;
  date: string;
  description: string;
  amount: number;
  reference: string | null;
  raw_hash: string;
  matched_source_id: string | null;
  imported_at: string;
  reconciled_at: string | null;
  ignored_at: string | null;
};

type BankReconciliationRow = {
  id: string;
  payment_account_id: string;
  statement_date: string;
  statement_balance: number;
  book_balance: number;
  difference: number;
  cleared_source_ids: unknown;
  created_at: string;
  finalized_at: string;
  voided_at: string | null;
};

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  unit_of_measure: string | null;
  cost_price: number;
  sell_price: number;
  reorder_point: number | null;
  inventory_chart_account_id: string | null;
  cogs_chart_account_id: string | null;
  revenue_chart_account_id: string | null;
  archived_at: string | null;
};

type InventoryMovementRow = {
  id: string;
  product_id: string;
  date: string;
  type: InventoryMovement["type"];
  quantity: number;
  unit_cost: number;
  memo: string | null;
  source_id: string | null;
};

type PurchaseOrderRow = {
  id: string;
  date: string;
  expected_date: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  status: PurchaseOrder["status"];
  memo: string | null;
  received_at: string | null;
  bill_transaction_id: string | null;
  billed_at: string | null;
};

type PurchaseOrderLineRow = {
  id: string;
  purchase_order_id: string;
  product_id: string;
  ordered_qty: number;
  unit_cost: number;
  received_qty: number;
  line_order: number;
};

type EmployeeRow = {
  id: string;
  name: string;
  pay_type: Employee["payType"];
  pay_rate: number;
  pay_frequency: Employee["payFrequency"];
  tax_free_threshold: boolean;
  employment_basis: Employee["employmentBasis"] | null;
  ordinary_hours_per_week: number | null;
  casual_loading_rate: number | null;
  super_fund_name: string | null;
  tfn: string | null;
  archived_at: string | null;
};

type PayRunRow = {
  id: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  pay_account_id: string | null;
  status: PayRun["status"];
  created_at: string;
  finalised_at: string | null;
  voided_at: string | null;
};

type PaySlipRow = {
  id: string;
  pay_run_id: string;
  employee_id: string;
  gross: number;
  payg_withheld: number;
  super_amount: number;
  net_pay: number;
  hours: number | null;
  adjustments: PaySlip["adjustments"] | null;
  line_order: number;
};

type RemittanceRow = {
  id: string;
  date: string;
  type: Remittance["type"];
  amount: number;
  pay_account_id: string | null;
  memo: string | null;
};

type STPSubmissionRow = {
  id: string;
  pay_run_id: string;
  submitted_at: string;
  status: STPSubmission["status"];
  reference_number: string | null;
  memo: string | null;
};

export type LedgerSnapshot = {
  business: {
    id: string;
    role: BusinessSummary["role"];
  };
  ledger: LedgerData;
};

export const canRoleViewPayroll = (role: BusinessSummary["role"]): boolean => (
  role === "owner" || role === "admin" || role === "bookkeeper"
);

const emptyLedgerData = (
  business: BusinessRow,
  settings: BusinessSettingsRow,
  rows: {
    chartAccounts: ChartAccountRow[];
    paymentAccounts: PaymentAccountRow[];
    categories: CategoryRow[];
    contacts: ContactRow[];
    transactions: TransactionRow[];
    invoicePayments: InvoicePaymentRow[];
    creditAllocations: CreditAllocationRow[];
    auditLog: AuditLogRow[];
    periodLocks: PeriodLockRow[];
    manualJournals: ManualJournalRow[];
    manualJournalLines: ManualJournalLineRow[];
    bankFeedItems: BankFeedItemRow[];
    bankReconciliations: BankReconciliationRow[];
    products: ProductRow[];
    inventoryMovements: InventoryMovementRow[];
    purchaseOrders: PurchaseOrderRow[];
    purchaseOrderLines: PurchaseOrderLineRow[];
    employees: EmployeeRow[];
    payRuns: PayRunRow[];
    paySlips: PaySlipRow[];
    remittances: RemittanceRow[];
    stpSubmissions: STPSubmissionRow[];
  },
  options: { canViewPayroll?: boolean } = {},
): LedgerData => ({
  meta: {
    version: 2,
    currency: business.currency,
    locale: business.locale,
    createdAt: business.created_at,
  },
  settings: {
    gstEnabled: settings.gst_enabled,
    gstRate: Number(settings.gst_rate),
    basBasis: settings.bas_basis,
    nextInvoiceNumber: settings.next_invoice_number,
    nextBillNumber: settings.next_bill_number,
    nextCreditNoteNumber: settings.next_credit_note_number,
    nextSupplierCreditNumber: settings.next_supplier_credit_number,
    nextReceiptNumber: settings.next_receipt_number,
    inventoryStateVersion: settings.inventory_state_version,
    payrollStateVersion: settings.payroll_state_version,
    invoicePrefix: settings.invoice_prefix,
    billPrefix: settings.bill_prefix,
    creditNotePrefix: settings.credit_note_prefix,
    supplierCreditPrefix: settings.supplier_credit_prefix,
    receiptPrefix: settings.receipt_prefix,
    businessProfile: {
      name: business.name,
      abn: business.abn ?? undefined,
      email: business.email ?? undefined,
      phone: business.phone ?? undefined,
      address: business.address ?? undefined,
      logoUri: business.logo_uri ?? undefined,
      logoText: business.logo_text ?? undefined,
      paymentInstructions: business.payment_instructions ?? undefined,
      invoiceFooter: business.invoice_footer ?? undefined,
    },
  },
  accounts: rows.paymentAccounts.map((account): Account => ({
    id: account.id,
    name: account.name,
    type: account.type,
    initBalance: Number(account.init_balance),
    icon: account.icon,
    color: account.color,
    chartAccountId: account.chart_account_id,
  })),
  chartOfAccounts: rows.chartAccounts.map((account): ChartAccount => ({
    id: account.id,
    code: account.code,
    name: account.name,
    class: account.class,
    group: account.group_name,
    normalBalance: account.normal_balance,
    isContra: account.is_contra || undefined,
  })),
  categories: {
    expense: rows.categories.filter((category) => category.type === "expense").map(mapCategory),
    income: rows.categories.filter((category) => category.type === "income").map(mapCategory),
  },
  transactions: rows.transactions.map((transaction): Transaction => {
    const payments = rows.invoicePayments
      .filter((payment) => payment.transaction_id === transaction.id)
      .map(mapInvoicePayment);

    return {
      id: transaction.id,
      type: transaction.type,
      amount: Number(transaction.amount),
      accountId: transaction.payment_account_id ?? undefined,
      accountToId: transaction.payment_account_to_id ?? undefined,
      categoryId: transaction.category_id ?? undefined,
      chartAccountId: transaction.chart_account_id ?? undefined,
      clearingChartAccountId: transaction.clearing_chart_account_id ?? undefined,
      date: transaction.date,
      note: transaction.note ?? undefined,
      gstMode: transaction.gst_mode ?? undefined,
      entryMode: transaction.entry_mode ?? undefined,
      contactId: transaction.contact_id ?? undefined,
      party: transaction.party ?? undefined,
      invoiceNo: transaction.invoice_no ?? undefined,
      creditNoteNo: transaction.credit_note_no ?? undefined,
      paymentTerms: transaction.payment_terms ?? undefined,
      dueDate: transaction.due_date ?? undefined,
      payments: payments.length ? payments : undefined,
      docStatus: transaction.doc_status ?? undefined,
      voidedAt: transaction.voided_at ?? undefined,
      recurringTemplateId: transaction.recurring_template_id ?? undefined,
      productId: transaction.product_id ?? undefined,
      productQty: transaction.product_qty === null ? undefined : Number(transaction.product_qty),
    };
  }),
  budgets: [],
  contacts: rows.contacts.map(mapContact),
  manualJournals: rows.manualJournals.map((journal) => mapManualJournal(journal, rows.manualJournalLines)),
  creditAllocations: rows.creditAllocations.filter((allocation) => !allocation.voided_at).map(mapCreditAllocation),
  periodLocks: rows.periodLocks.map(mapPeriodLock),
  bankReconciliations: rows.bankReconciliations.map(mapBankReconciliation),
  bankFeedItems: rows.bankFeedItems.map(mapBankFeedItem),
  recurringTemplates: [],
  auditLog: rows.auditLog.map(mapAuditLogEntry),
  products: rows.products.map(mapProduct),
  inventoryItems: [],
  inventoryMovements: rows.inventoryMovements.map(mapInventoryMovement),
  employees: options.canViewPayroll === false ? [] : rows.employees.map(mapEmployee),
  payRuns: options.canViewPayroll === false ? [] : rows.payRuns.map((run) => mapPayRun(run, rows.paySlips)),
  remittances: options.canViewPayroll === false ? [] : rows.remittances.map(mapRemittance),
  stpSubmissions: options.canViewPayroll === false ? [] : rows.stpSubmissions.map(mapSTPSubmission),
    purchaseOrders: rows.purchaseOrders.map((order) => mapPurchaseOrder(order, rows.purchaseOrderLines)),
    fixedAssets: [],
    depreciationRuns: [],
});

const mapCategory = (category: CategoryRow): Category => ({
  id: category.id,
  name: category.name,
  icon: category.icon,
  color: category.color,
  chartAccountId: category.chart_account_id ?? undefined,
  archivedAt: category.archived_at ?? undefined,
});

const mapContact = (contact: ContactRow): Contact => ({
  id: contact.id,
  type: contact.type,
  name: contact.name,
  abn: contact.abn ?? undefined,
  email: contact.email ?? undefined,
  phone: contact.phone ?? undefined,
  address: contact.address ?? undefined,
  paymentTerms: contact.payment_terms ?? "due_on_receipt",
  createdAt: contact.created_at,
  archivedAt: contact.archived_at ?? undefined,
});

const mapInvoicePayment = (payment: InvoicePaymentRow): InvoicePayment => ({
  id: payment.id,
  amount: Number(payment.amount),
  date: payment.date,
  accountId: payment.payment_account_id,
  receiptNo: payment.receipt_no ?? undefined,
  receiptCreatedAt: payment.receipt_created_at ?? undefined,
  voidedAt: payment.voided_at ?? undefined,
});

const mapCreditAllocation = (allocation: CreditAllocationRow): CreditAllocation => ({
  id: allocation.id,
  creditNoteId: allocation.credit_note_id,
  invoiceId: allocation.invoice_id,
  amount: Number(allocation.amount),
  date: allocation.date,
});

const mapAuditLogEntry = (entry: AuditLogRow): AuditLogEntry => ({
  id: entry.id,
  action: entry.action,
  entityType: entry.entity_type,
  entityId: entry.entity_id,
  detail: entry.detail,
  date: entry.created_at,
});

const mapPeriodLock = (lock: PeriodLockRow): PeriodLock => ({
  id: lock.id,
  lockedThrough: lock.locked_through,
  note: lock.note ?? undefined,
  createdAt: lock.created_at,
});

const mapManualJournal = (journal: ManualJournalRow, lines: ManualJournalLineRow[]): ManualJournal => ({
  id: journal.id,
  date: journal.date,
  memo: journal.memo,
  lines: lines
    .filter((line) => line.manual_journal_id === journal.id)
    .sort((a, b) => a.line_order - b.line_order)
    .map((line) => ({
      chartAccountId: line.chart_account_id,
      debit: Number(line.debit),
      credit: Number(line.credit),
    })),
  createdAt: journal.created_at,
  updatedAt: journal.updated_at ?? undefined,
  reversedAt: journal.reversed_at ?? undefined,
  reversalOf: journal.reversal_of ?? undefined,
  voidedAt: journal.voided_at ?? undefined,
});

const mapBankFeedItem = (item: BankFeedItemRow): BankFeedItem => ({
  id: item.id,
  accountId: item.payment_account_id,
  date: item.date,
  description: item.description,
  amount: Number(item.amount),
  reference: item.reference ?? undefined,
  rawHash: item.raw_hash,
  matchedSourceId: item.matched_source_id ?? undefined,
  importedAt: item.imported_at,
  reconciledAt: item.reconciled_at ?? undefined,
  ignoredAt: item.ignored_at ?? undefined,
});

const mapBankReconciliation = (reconciliation: BankReconciliationRow): BankReconciliation => ({
  id: reconciliation.id,
  accountId: reconciliation.payment_account_id,
  statementDate: reconciliation.statement_date,
  statementBalance: Number(reconciliation.statement_balance),
  bookBalance: Number(reconciliation.book_balance),
  difference: Number(reconciliation.difference),
  clearedSourceIds: Array.isArray(reconciliation.cleared_source_ids)
    ? reconciliation.cleared_source_ids.map(String)
    : [],
  createdAt: reconciliation.created_at,
  finalizedAt: reconciliation.finalized_at,
  voidedAt: reconciliation.voided_at ?? undefined,
});

const mapProduct = (product: ProductRow): Product => ({
  id: product.id,
  name: product.name,
  sku: product.sku ?? undefined,
  unitOfMeasure: product.unit_of_measure ?? undefined,
  costPrice: Number(product.cost_price),
  sellPrice: Number(product.sell_price),
  reorderPoint: product.reorder_point === null ? undefined : Number(product.reorder_point),
  inventoryChartAccountId: product.inventory_chart_account_id ?? undefined,
  cogsChartAccountId: product.cogs_chart_account_id ?? undefined,
  revenueChartAccountId: product.revenue_chart_account_id ?? undefined,
  archivedAt: product.archived_at ?? undefined,
});

const mapInventoryMovement = (movement: InventoryMovementRow): InventoryMovement => ({
  id: movement.id,
  productId: movement.product_id,
  date: movement.date,
  type: movement.type,
  quantity: Number(movement.quantity),
  unitCost: Number(movement.unit_cost),
  memo: movement.memo ?? undefined,
  sourceId: movement.source_id ?? undefined,
});

const mapPurchaseOrder = (order: PurchaseOrderRow, lines: PurchaseOrderLineRow[]): PurchaseOrder => ({
  id: order.id,
  date: order.date,
  expectedDate: order.expected_date ?? undefined,
  supplierId: order.supplier_id ?? undefined,
  supplierName: order.supplier_name ?? undefined,
  status: order.status,
  memo: order.memo ?? undefined,
  receivedAt: order.received_at ?? undefined,
  billTransactionId: order.bill_transaction_id ?? undefined,
  billedAt: order.billed_at ?? undefined,
  lines: lines
    .filter((line) => line.purchase_order_id === order.id)
    .sort((a, b) => a.line_order - b.line_order)
    .map((line): POLine => ({
      productId: line.product_id,
      orderedQty: Number(line.ordered_qty),
      unitCost: Number(line.unit_cost),
      receivedQty: Number(line.received_qty),
    })),
});

const mapEmployee = (employee: EmployeeRow): Employee => ({
  id: employee.id,
  name: employee.name,
  payType: employee.pay_type,
  payRate: Number(employee.pay_rate),
  payFrequency: employee.pay_frequency,
  taxFreeThreshold: employee.tax_free_threshold,
  employmentBasis: employee.employment_basis ?? undefined,
  ordinaryHoursPerWeek: employee.ordinary_hours_per_week === null ? undefined : Number(employee.ordinary_hours_per_week),
  casualLoadingRate: employee.casual_loading_rate === null ? undefined : Number(employee.casual_loading_rate),
  superFundName: employee.super_fund_name ?? undefined,
  tfn: employee.tfn ?? undefined,
  archivedAt: employee.archived_at ?? undefined,
});

const mapPayRun = (run: PayRunRow, slips: PaySlipRow[]): PayRun => ({
  id: run.id,
  periodStart: run.period_start,
  periodEnd: run.period_end,
  payDate: run.pay_date,
  payAccountId: run.pay_account_id ?? undefined,
  status: run.status,
  createdAt: run.created_at,
  finalisedAt: run.finalised_at ?? undefined,
  voidedAt: run.voided_at ?? undefined,
  paySlips: slips
    .filter((slip) => slip.pay_run_id === run.id)
    .sort((a, b) => a.line_order - b.line_order)
    .map((slip): PaySlip => ({
      id: slip.id,
      employeeId: slip.employee_id,
      gross: Number(slip.gross),
      paygWithheld: Number(slip.payg_withheld),
      superAmount: Number(slip.super_amount),
      netPay: Number(slip.net_pay),
      hours: slip.hours === null ? undefined : Number(slip.hours),
      adjustments: Array.isArray(slip.adjustments) ? slip.adjustments : undefined,
    })),
});

const mapRemittance = (remittance: RemittanceRow): Remittance => ({
  id: remittance.id,
  date: remittance.date,
  type: remittance.type,
  amount: Number(remittance.amount),
  payAccountId: remittance.pay_account_id ?? undefined,
  memo: remittance.memo ?? undefined,
});

const mapSTPSubmission = (submission: STPSubmissionRow): STPSubmission => ({
  id: submission.id,
  payRunId: submission.pay_run_id,
  submittedAt: submission.submitted_at,
  status: submission.status,
  referenceNumber: submission.reference_number ?? undefined,
  memo: submission.memo ?? undefined,
});

export const getLedgerSnapshot = async (
  supabase: SupabaseServiceClient,
  userId: string,
  businessId: string,
): Promise<LedgerSnapshot> => {
  const { data: membership, error: membershipError } = await supabase
    .from("business_members")
    .select(
      `
        role,
        businesses:business_id (
          id,
          name,
          abn,
          email,
          phone,
          address,
          logo_uri,
          logo_text,
          payment_instructions,
          invoice_footer,
          currency,
          locale,
          created_at
        )
      `,
    )
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError) {
    throw new ApiError(500, "ledger_snapshot_failed", membershipError.message);
  }

  const membershipRow = membership as unknown as MembershipRow | null;
  if (!membershipRow?.businesses) {
    throw new ApiError(403, "forbidden", "You do not have access to this business.");
  }

  const { data: settings, error: settingsError } = await supabase
    .from("business_settings")
    .select(
      `
        gst_enabled,
        gst_rate,
        bas_basis,
        invoice_prefix,
        bill_prefix,
        credit_note_prefix,
        supplier_credit_prefix,
        receipt_prefix,
        next_invoice_number,
        next_bill_number,
        next_credit_note_number,
        next_supplier_credit_number,
        next_receipt_number,
        inventory_state_version,
        payroll_state_version
      `,
    )
    .eq("business_id", businessId)
    .single();

  if (settingsError || !settings) {
    throw new ApiError(500, "ledger_snapshot_failed", settingsError?.message ?? "Business settings missing.");
  }

  try {
    await seedAccountingFoundation(supabase, businessId);
  } catch (error) {
    if (error instanceof AccountingSeedError) {
      throw new ApiError(500, error.code, error.message);
    }
    throw error;
  }

  const [
    { data: chartAccounts, error: chartAccountsError },
    { data: paymentAccounts, error: paymentAccountsError },
    { data: categories, error: categoriesError },
    { data: contacts, error: contactsError },
    { data: transactions, error: transactionsError },
    { data: invoicePayments, error: invoicePaymentsError },
    { data: creditAllocations, error: creditAllocationsError },
    { data: auditLog, error: auditLogError },
    { data: periodLocks, error: periodLocksError },
    { data: manualJournals, error: manualJournalsError },
    { data: manualJournalLines, error: manualJournalLinesError },
    { data: bankFeedItems, error: bankFeedItemsError },
    { data: bankReconciliations, error: bankReconciliationsError },
    { data: products, error: productsError },
    { data: inventoryMovements, error: inventoryMovementsError },
    { data: purchaseOrders, error: purchaseOrdersError },
    { data: purchaseOrderLines, error: purchaseOrderLinesError },
    { data: employees, error: employeesError },
    { data: payRuns, error: payRunsError },
    { data: paySlips, error: paySlipsError },
    { data: remittances, error: remittancesError },
    { data: stpSubmissions, error: stpSubmissionsError },
  ] = await Promise.all([
    supabase
      .from("chart_accounts")
      .select("id,code,name,class,group_name,normal_balance,is_contra")
      .eq("business_id", businessId)
      .order("code", { ascending: true }),
    supabase
      .from("payment_accounts")
      .select("id,name,type,init_balance,icon,color,chart_account_id")
      .eq("business_id", businessId)
      .is("archived_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("categories")
      .select("id,type,name,icon,color,chart_account_id,archived_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: true }),
    supabase
      .from("contacts")
      .select("id,type,name,abn,email,phone,address,payment_terms,created_at,archived_at")
      .eq("business_id", businessId)
      .is("archived_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("transactions")
      .select(
        "id,type,amount,payment_account_id,payment_account_to_id,category_id,chart_account_id,clearing_chart_account_id,date,note,gst_mode,entry_mode,contact_id,party,invoice_no,credit_note_no,payment_terms,due_date,doc_status,voided_at,recurring_template_id,product_id,product_qty",
      )
      .eq("business_id", businessId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("invoice_payments")
      .select("id,transaction_id,amount,date,payment_account_id,receipt_no,receipt_created_at,voided_at")
      .eq("business_id", businessId)
      .order("date", { ascending: true }),
    supabase
      .from("credit_allocations")
      .select("id,credit_note_id,invoice_id,amount,date,voided_at")
      .eq("business_id", businessId)
      .order("date", { ascending: true }),
    supabase
      .from("audit_log")
      .select("id,action,entity_type,entity_id,detail,created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false }),
    supabase
      .from("period_locks")
      .select("id,locked_through,note,created_at")
      .eq("business_id", businessId)
      .order("locked_through", { ascending: false }),
    supabase
      .from("manual_journals")
      .select("id,date,memo,created_at,updated_at,reversed_at,reversal_of,voided_at")
      .eq("business_id", businessId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("manual_journal_lines")
      .select("manual_journal_id,chart_account_id,debit,credit,line_order")
      .eq("business_id", businessId)
      .order("line_order", { ascending: true }),
    supabase
      .from("bank_feed_items")
      .select("id,payment_account_id,date,description,amount,reference,raw_hash,matched_source_id,imported_at,reconciled_at,ignored_at")
      .eq("business_id", businessId)
      .order("date", { ascending: false })
      .order("imported_at", { ascending: false }),
    supabase
      .from("bank_reconciliations")
      .select("id,payment_account_id,statement_date,statement_balance,book_balance,difference,cleared_source_ids,created_at,finalized_at,voided_at")
      .eq("business_id", businessId)
      .order("statement_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("products")
      .select("id,name,sku,unit_of_measure,cost_price,sell_price,reorder_point,inventory_chart_account_id,cogs_chart_account_id,revenue_chart_account_id,archived_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: true }),
    supabase
      .from("inventory_movements")
      .select("id,product_id,date,type,quantity,unit_cost,memo,source_id")
      .eq("business_id", businessId)
      .order("date", { ascending: true }),
    supabase
      .from("purchase_orders")
      .select("id,date,expected_date,supplier_id,supplier_name,status,memo,received_at,bill_transaction_id,billed_at")
      .eq("business_id", businessId)
      .order("date", { ascending: false }),
    supabase
      .from("purchase_order_lines")
      .select("id,purchase_order_id,product_id,ordered_qty,unit_cost,received_qty,line_order")
      .eq("business_id", businessId)
      .order("line_order", { ascending: true }),
    supabase
      .from("employees")
      .select("id,name,pay_type,pay_rate,pay_frequency,tax_free_threshold,employment_basis,ordinary_hours_per_week,casual_loading_rate,super_fund_name,tfn,archived_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: true }),
    supabase
      .from("pay_runs")
      .select("id,period_start,period_end,pay_date,pay_account_id,status,created_at,finalised_at,voided_at")
      .eq("business_id", businessId)
      .order("pay_date", { ascending: false }),
    supabase
      .from("pay_slips")
      .select("id,pay_run_id,employee_id,gross,payg_withheld,super_amount,net_pay,hours,adjustments,line_order")
      .eq("business_id", businessId)
      .order("line_order", { ascending: true }),
    supabase
      .from("remittances")
      .select("id,date,type,amount,pay_account_id,memo")
      .eq("business_id", businessId)
      .order("date", { ascending: false }),
    supabase
      .from("stp_submissions")
      .select("id,pay_run_id,submitted_at,status,reference_number,memo")
      .eq("business_id", businessId)
      .order("submitted_at", { ascending: false }),
  ]);

  if (chartAccountsError) {
    throw new ApiError(500, "ledger_snapshot_failed", chartAccountsError.message);
  }

  if (paymentAccountsError) {
    throw new ApiError(500, "ledger_snapshot_failed", paymentAccountsError.message);
  }

  if (categoriesError) {
    throw new ApiError(500, "ledger_snapshot_failed", categoriesError.message);
  }

  if (contactsError) {
    throw new ApiError(500, "ledger_snapshot_failed", contactsError.message);
  }

  if (transactionsError) {
    throw new ApiError(500, "ledger_snapshot_failed", transactionsError.message);
  }

  if (invoicePaymentsError) {
    throw new ApiError(500, "ledger_snapshot_failed", invoicePaymentsError.message);
  }

  if (creditAllocationsError) {
    throw new ApiError(500, "ledger_snapshot_failed", creditAllocationsError.message);
  }

  if (auditLogError) {
    throw new ApiError(500, "ledger_snapshot_failed", auditLogError.message);
  }

  if (periodLocksError) {
    throw new ApiError(500, "ledger_snapshot_failed", periodLocksError.message);
  }

  if (manualJournalsError) {
    throw new ApiError(500, "ledger_snapshot_failed", manualJournalsError.message);
  }

  if (manualJournalLinesError) {
    throw new ApiError(500, "ledger_snapshot_failed", manualJournalLinesError.message);
  }

  if (bankFeedItemsError) {
    throw new ApiError(500, "ledger_snapshot_failed", bankFeedItemsError.message);
  }

  if (bankReconciliationsError) {
    throw new ApiError(500, "ledger_snapshot_failed", bankReconciliationsError.message);
  }
  const moduleErrors = [
    productsError,
    inventoryMovementsError,
    purchaseOrdersError,
    purchaseOrderLinesError,
    employeesError,
    payRunsError,
    paySlipsError,
    remittancesError,
    stpSubmissionsError,
  ].filter(Boolean);
  if (moduleErrors[0]) {
    throw new ApiError(500, "ledger_snapshot_failed", moduleErrors[0].message);
  }

  const canViewPayroll = canRoleViewPayroll(membershipRow.role);

  return {
    business: {
      id: membershipRow.businesses.id,
      role: membershipRow.role,
    },
    ledger: emptyLedgerData(membershipRow.businesses, settings as unknown as BusinessSettingsRow, {
      chartAccounts: (chartAccounts ?? []) as unknown as ChartAccountRow[],
      paymentAccounts: (paymentAccounts ?? []) as unknown as PaymentAccountRow[],
      categories: (categories ?? []) as unknown as CategoryRow[],
      contacts: (contacts ?? []) as unknown as ContactRow[],
      transactions: (transactions ?? []) as unknown as TransactionRow[],
      invoicePayments: (invoicePayments ?? []) as unknown as InvoicePaymentRow[],
      creditAllocations: (creditAllocations ?? []) as unknown as CreditAllocationRow[],
      auditLog: (auditLog ?? []) as unknown as AuditLogRow[],
      periodLocks: (periodLocks ?? []) as unknown as PeriodLockRow[],
      manualJournals: (manualJournals ?? []) as unknown as ManualJournalRow[],
      manualJournalLines: (manualJournalLines ?? []) as unknown as ManualJournalLineRow[],
      bankFeedItems: (bankFeedItems ?? []) as unknown as BankFeedItemRow[],
      bankReconciliations: (bankReconciliations ?? []) as unknown as BankReconciliationRow[],
      products: (products ?? []) as unknown as ProductRow[],
      inventoryMovements: (inventoryMovements ?? []) as unknown as InventoryMovementRow[],
      purchaseOrders: (purchaseOrders ?? []) as unknown as PurchaseOrderRow[],
      purchaseOrderLines: (purchaseOrderLines ?? []) as unknown as PurchaseOrderLineRow[],
      employees: (employees ?? []) as unknown as EmployeeRow[],
      payRuns: (payRuns ?? []) as unknown as PayRunRow[],
      paySlips: (paySlips ?? []) as unknown as PaySlipRow[],
      remittances: (remittances ?? []) as unknown as RemittanceRow[],
      stpSubmissions: (stpSubmissions ?? []) as unknown as STPSubmissionRow[],
    }, { canViewPayroll }),
  };
};
