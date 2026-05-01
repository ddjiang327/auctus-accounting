import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allJournalEntries,
  arApAging,
  basReport,
  creditNoteBalance,
  financialPosition,
  gstSplit,
  isDateLocked,
  openingBalanceEntries,
  paymentJournalEntry,
  reconciliationRows,
  trialBalance,
  txBalance,
  txGst,
  txJournalEntry,
  txTotal,
  validateCreditAllocations,
  validatePaymentInput,
  validateTransactionInput,
} from "../dist/index.js";

const chartOfAccounts = [
  { id: "coa_bank", code: "1010", name: "Bank", class: "asset", group: "Cash", normalBalance: "debit" },
  { id: "coa_ar", code: "1100", name: "Accounts Receivable", class: "asset", group: "Current Assets", normalBalance: "debit" },
  { id: "coa_gst_paid", code: "1130", name: "GST Paid", class: "asset", group: "GST", normalBalance: "debit" },
  { id: "coa_ap", code: "2000", name: "Accounts Payable", class: "liability", group: "Current Liabilities", normalBalance: "credit" },
  { id: "coa_gst_collected", code: "2130", name: "GST Collected", class: "liability", group: "GST", normalBalance: "credit" },
  { id: "coa_equity", code: "3150", name: "Opening Balance Equity", class: "equity", group: "Equity", normalBalance: "credit" },
  { id: "coa_sales", code: "4010", name: "Sales", class: "revenue", group: "Revenue", normalBalance: "credit" },
  { id: "coa_supplies", code: "7030", name: "Office Supplies", class: "expense", group: "Expenses", normalBalance: "debit" },
];

function ledger(overrides = {}) {
  return {
    meta: { version: 2, currency: "AUD", locale: "en-AU", createdAt: "2026-01-01T00:00:00.000Z" },
    settings: {
      gstEnabled: true,
      gstRate: 0.1,
      nextInvoiceNumber: 1,
      nextBillNumber: 1,
      nextCreditNoteNumber: 1,
      nextSupplierCreditNumber: 1,
      nextReceiptNumber: 1,
      invoicePrefix: "INV-",
      billPrefix: "BILL-",
      creditNotePrefix: "CN-",
      supplierCreditPrefix: "SC-",
      receiptPrefix: "REC-",
      businessProfile: { name: "Auctus" },
    },
    accounts: [
      { id: "bank", name: "Bank", type: "bank", initBalance: 0, icon: "", color: "", chartAccountId: "coa_bank" },
      { id: "bank_2", name: "Savings", type: "bank", initBalance: 0, icon: "", color: "", chartAccountId: "coa_ar" },
    ],
    chartOfAccounts,
    categories: { expense: [], income: [] },
    transactions: [],
    budgets: [],
    contacts: [],
    manualJournals: [],
    creditAllocations: [],
    periodLocks: [],
    bankReconciliations: [],
    bankFeedItems: [],
    recurringTemplates: [],
    auditLog: [],
    ...overrides,
  };
}

describe("GST calculations", () => {
  it("splits GST-inclusive amounts into net, GST, and total", () => {
    assert.deepEqual(gstSplit(110, "inc", 0.1), {
      net: 100,
      gst: 10,
      total: 110,
      mode: "inc",
    });
  });

  it("adds GST to GST-exclusive amounts", () => {
    assert.deepEqual(gstSplit(100, "exc", 0.1), {
      net: 100,
      gst: 10,
      total: 110,
      mode: "exc",
    });
  });

  it("treats GST-free amounts as zero GST", () => {
    assert.deepEqual(gstSplit(100, "free", 0.1), {
      net: 100,
      gst: 0,
      total: 100,
      mode: "free",
    });
  });

  it("ignores transaction GST mode when GST is disabled", () => {
    const data = ledger({
      settings: {
        ...ledger().settings,
        gstEnabled: false,
      },
    });
    const tx = {
      id: "tx_no_gst",
      type: "income",
      amount: 110,
      accountId: "bank",
      chartAccountId: "coa_sales",
      date: "2026-01-15",
      gstMode: "inc",
    };

    assert.equal(txTotal(tx, data), 110);
    assert.equal(txGst(tx, data), 0);
    assert.deepEqual(txJournalEntry(tx, data)?.lines, [
      { chartAccountId: "coa_bank", debit: 110, credit: 0 },
      { chartAccountId: "coa_sales", debit: 0, credit: 110 },
    ]);
  });
});

describe("posting", () => {
  it("posts a cash GST-inclusive income transaction to bank, revenue, and GST collected", () => {
    const data = ledger();
    const entry = txJournalEntry({
      id: "tx_income",
      type: "income",
      amount: 110,
      accountId: "bank",
      chartAccountId: "coa_sales",
      date: "2026-01-15",
      gstMode: "inc",
    }, data);

    assert.deepEqual(entry?.lines, [
      { chartAccountId: "coa_bank", debit: 110, credit: 0 },
      { chartAccountId: "coa_sales", debit: 0, credit: 100 },
      { chartAccountId: "coa_gst_collected", debit: 0, credit: 10 },
    ]);
  });

  it("keeps debit and credit totals balanced in trial balance", () => {
    const data = ledger({
      transactions: [
        {
          id: "tx_income",
          type: "income",
          amount: 110,
          accountId: "bank",
          chartAccountId: "coa_sales",
          date: "2026-01-15",
          gstMode: "inc",
        },
        {
          id: "tx_expense",
          type: "expense",
          amount: 55,
          accountId: "bank",
          chartAccountId: "coa_supplies",
          date: "2026-01-20",
          gstMode: "inc",
        },
      ],
    });

    const totals = trialBalance(data).reduce((sum, row) => ({
      debit: sum.debit + row.debit,
      credit: sum.credit + row.credit,
    }), { debit: 0, credit: 0 });

    assert.equal(+totals.debit.toFixed(2), 110);
    assert.equal(+totals.credit.toFixed(2), 110);
  });

  it("posts an income credit note as the reverse of an invoice", () => {
    const data = ledger();
    const entry = txJournalEntry({
      id: "cn_income",
      type: "income",
      entryMode: "credit_note",
      amount: 110,
      chartAccountId: "coa_sales",
      clearingChartAccountId: "coa_ar",
      date: "2026-01-22",
      gstMode: "inc",
    }, data);

    assert.deepEqual(entry?.lines, [
      { chartAccountId: "coa_sales", debit: 100, credit: 0 },
      { chartAccountId: "coa_gst_collected", debit: 10, credit: 0 },
      { chartAccountId: "coa_ar", debit: 0, credit: 110 },
    ]);
  });

  it("posts a supplier credit as the reverse of a bill", () => {
    const data = ledger();
    const entry = txJournalEntry({
      id: "cn_expense",
      type: "expense",
      entryMode: "credit_note",
      amount: 55,
      chartAccountId: "coa_supplies",
      clearingChartAccountId: "coa_ap",
      date: "2026-01-22",
      gstMode: "inc",
    }, data);

    assert.deepEqual(entry?.lines, [
      { chartAccountId: "coa_ap", debit: 55, credit: 0 },
      { chartAccountId: "coa_supplies", debit: 0, credit: 50 },
      { chartAccountId: "coa_gst_paid", debit: 0, credit: 5 },
    ]);
  });

  it("does not create a journal entry for voided transactions", () => {
    const data = ledger();
    const entry = txJournalEntry({
      id: "voided",
      type: "income",
      amount: 110,
      accountId: "bank",
      chartAccountId: "coa_sales",
      date: "2026-01-15",
      gstMode: "inc",
      voidedAt: "2026-01-16T00:00:00.000Z",
    }, data);

    assert.equal(entry, null);
  });

  it("posts transfers between payment accounts", () => {
    const data = ledger();
    const entry = txJournalEntry({
      id: "transfer",
      type: "transfer",
      amount: 25,
      accountId: "bank",
      accountToId: "bank_2",
      date: "2026-01-15",
    }, data);

    assert.deepEqual(entry?.lines, [
      { chartAccountId: "coa_ar", debit: 25, credit: 0 },
      { chartAccountId: "coa_bank", debit: 0, credit: 25 },
    ]);
  });

  it("posts customer invoice payments from AR to the payment account", () => {
    const invoice = {
      id: "inv_1",
      type: "income",
      entryMode: "invoice",
      amount: 110,
      chartAccountId: "coa_sales",
      clearingChartAccountId: "coa_ar",
      date: "2026-01-10",
      gstMode: "inc",
      party: "Customer Co",
    };
    const payment = { id: "pay_income", amount: 60, date: "2026-01-20", accountId: "bank" };
    const entry = paymentJournalEntry(invoice, payment, ledger());

    assert.equal(entry?.memo, "Payment received – Customer Co");
    assert.deepEqual(entry?.lines, [
      { chartAccountId: "coa_bank", debit: 60, credit: 0 },
      { chartAccountId: "coa_ar", debit: 0, credit: 60 },
    ]);
  });

  it("posts supplier bill payments from AP to the payment account", () => {
    const bill = {
      id: "bill_1",
      type: "expense",
      entryMode: "invoice",
      amount: 55,
      chartAccountId: "coa_supplies",
      clearingChartAccountId: "coa_ap",
      date: "2026-01-10",
      gstMode: "inc",
      party: "Supplier Co",
    };
    const payment = { id: "pay_expense", amount: 25, date: "2026-01-20", accountId: "bank" };
    const entry = paymentJournalEntry(bill, payment, ledger());

    assert.equal(entry?.memo, "Payment made – Supplier Co");
    assert.deepEqual(entry?.lines, [
      { chartAccountId: "coa_ap", debit: 25, credit: 0 },
      { chartAccountId: "coa_bank", debit: 0, credit: 25 },
    ]);
  });

  it("creates balanced opening balance entries for asset and credit card accounts", () => {
    const data = ledger({
      chartOfAccounts: [
        ...chartOfAccounts,
        { id: "coa_card", code: "2110", name: "Credit Card", class: "liability", group: "Current Liabilities", normalBalance: "credit" },
      ],
      accounts: [
        { id: "bank", name: "Bank", type: "bank", initBalance: 250, icon: "", color: "", chartAccountId: "coa_bank" },
        { id: "card", name: "Credit Card", type: "credit", initBalance: -75, icon: "", color: "", chartAccountId: "coa_card" },
      ],
    });

    assert.deepEqual(openingBalanceEntries(data).map((entry) => entry.lines), [
      [
        { chartAccountId: "coa_bank", debit: 250, credit: 0 },
        { chartAccountId: "coa_equity", debit: 0, credit: 250 },
      ],
      [
        { chartAccountId: "coa_card", debit: 0, credit: 75 },
        { chartAccountId: "coa_equity", debit: 75, credit: 0 },
      ],
    ]);
  });

  it("includes opening balances, manual journals, transaction entries, and invoice payments in all journal entries", () => {
    const data = ledger({
      accounts: [
        { id: "bank", name: "Bank", type: "bank", initBalance: 100, icon: "", color: "", chartAccountId: "coa_bank" },
      ],
      manualJournals: [
        {
          id: "mj_1",
          date: "2026-01-05",
          memo: "Accrual",
          createdAt: "2026-01-05T00:00:00.000Z",
          lines: [
            { chartAccountId: "coa_supplies", debit: 30, credit: 0 },
            { chartAccountId: "coa_ap", debit: 0, credit: 30 },
          ],
        },
        {
          id: "mj_void",
          date: "2026-01-06",
          memo: "Voided",
          createdAt: "2026-01-06T00:00:00.000Z",
          voidedAt: "2026-01-07T00:00:00.000Z",
          lines: [
            { chartAccountId: "coa_supplies", debit: 99, credit: 0 },
            { chartAccountId: "coa_ap", debit: 0, credit: 99 },
          ],
        },
      ],
      transactions: [
        {
          id: "inv_1",
          type: "income",
          entryMode: "invoice",
          amount: 110,
          chartAccountId: "coa_sales",
          clearingChartAccountId: "coa_ar",
          date: "2026-01-10",
          gstMode: "inc",
          payments: [{ id: "pay_1", amount: 40, date: "2026-01-20", accountId: "bank" }],
        },
      ],
    });

    assert.deepEqual(allJournalEntries(data).map((entry) => entry.sourceId), [
      "opening_bank",
      "mj_1",
      "inv_1",
      "pay_1",
    ]);
  });
});

describe("documents and BAS", () => {
  it("calculates invoice balance after payment and valid credit allocation", () => {
    const invoice = {
      id: "inv_1",
      type: "income",
      entryMode: "invoice",
      amount: 110,
      chartAccountId: "coa_sales",
      clearingChartAccountId: "coa_ar",
      date: "2026-01-15",
      gstMode: "inc",
      payments: [{ id: "pay_1", amount: 40, date: "2026-01-20", accountId: "bank" }],
    };
    const creditNote = {
      id: "cn_1",
      type: "income",
      entryMode: "credit_note",
      amount: 20,
      chartAccountId: "coa_sales",
      clearingChartAccountId: "coa_ar",
      date: "2026-01-21",
      gstMode: "free",
    };
    const data = ledger({
      transactions: [invoice, creditNote],
      creditAllocations: [{ id: "alloc_1", creditNoteId: "cn_1", invoiceId: "inv_1", amount: 20, date: "2026-01-21" }],
    });

    assert.equal(txBalance(invoice, data), 50);
  });

  it("ignores voided credit notes when calculating invoice balance", () => {
    const invoice = {
      id: "inv_1",
      type: "income",
      entryMode: "invoice",
      amount: 110,
      chartAccountId: "coa_sales",
      clearingChartAccountId: "coa_ar",
      date: "2026-01-15",
      gstMode: "inc",
      payments: [],
    };
    const creditNote = {
      id: "cn_void",
      type: "income",
      entryMode: "credit_note",
      amount: 20,
      chartAccountId: "coa_sales",
      clearingChartAccountId: "coa_ar",
      date: "2026-01-21",
      gstMode: "free",
      voidedAt: "2026-01-22T00:00:00.000Z",
    };
    const data = ledger({
      transactions: [invoice, creditNote],
      creditAllocations: [{ id: "alloc_1", creditNoteId: "cn_void", invoiceId: "inv_1", amount: 20, date: "2026-01-21" }],
    });

    assert.equal(txBalance(invoice, data), 110);
  });

  it("calculates remaining credit note balance after allocations", () => {
    const creditNote = {
      id: "cn_1",
      type: "income",
      entryMode: "credit_note",
      amount: 110,
      chartAccountId: "coa_sales",
      clearingChartAccountId: "coa_ar",
      date: "2026-01-21",
      gstMode: "inc",
    };
    const data = ledger({
      transactions: [creditNote],
      creditAllocations: [{ id: "alloc_1", creditNoteId: "cn_1", invoiceId: "inv_1", amount: 45, date: "2026-01-21" }],
    });

    assert.equal(creditNoteBalance(creditNote, data), 65);
  });

  it("summarizes BAS sales, purchases, credit notes, and net GST", () => {
    const data = ledger({
      settings: {
        ...ledger().settings,
        basBasis: "accrual",
      },
      transactions: [
        { id: "sale", type: "income", amount: 110, accountId: "bank", chartAccountId: "coa_sales", date: "2026-01-10", gstMode: "inc" },
        { id: "purchase", type: "expense", amount: 55, accountId: "bank", chartAccountId: "coa_supplies", date: "2026-01-11", gstMode: "inc" },
        { id: "credit", type: "income", entryMode: "credit_note", amount: 11, chartAccountId: "coa_sales", clearingChartAccountId: "coa_ar", date: "2026-01-12", gstMode: "inc" },
      ],
    });

    const report = basReport(data, "2026-01-01", "2026-01-31");

    assert.equal(report.salesGross, 99);
    assert.equal(report.gstCollected, 9);
    assert.equal(report.purchasesGross, 55);
    assert.equal(report.gstPaid, 5);
    assert.equal(report.netGst, 4);
  });

  it("reports invoice GST on payment date for cash-basis BAS", () => {
    const data = ledger({
      settings: {
        ...ledger().settings,
        basBasis: "cash",
      },
      transactions: [
        {
          id: "inv_cash",
          type: "income",
          entryMode: "invoice",
          amount: 110,
          chartAccountId: "coa_sales",
          clearingChartAccountId: "coa_ar",
          date: "2026-01-10",
          gstMode: "inc",
          payments: [{ id: "pay_1", amount: 55, date: "2026-02-05", accountId: "bank" }],
        },
      ],
    });

    assert.equal(basReport(data, "2026-01-01", "2026-01-31").gstCollected, 0);
    assert.equal(basReport(data, "2026-02-01", "2026-02-28").gstCollected, 5);
  });

  it("reports invoices on document date for accrual-basis BAS", () => {
    const data = ledger({
      settings: {
        ...ledger().settings,
        basBasis: "accrual",
      },
      transactions: [
        {
          id: "inv_accrual",
          type: "income",
          entryMode: "invoice",
          amount: 110,
          chartAccountId: "coa_sales",
          clearingChartAccountId: "coa_ar",
          date: "2026-01-10",
          gstMode: "inc",
          payments: [{ id: "pay_1", amount: 55, date: "2026-02-05", accountId: "bank" }],
        },
      ],
    });

    assert.equal(basReport(data, "2026-01-01", "2026-01-31").gstCollected, 10);
    assert.equal(basReport(data, "2026-02-01", "2026-02-28").gstCollected, 0);
  });

  it("excludes voided transactions from BAS", () => {
    const data = ledger({
      transactions: [
        { id: "sale", type: "income", amount: 110, accountId: "bank", chartAccountId: "coa_sales", date: "2026-01-10", gstMode: "inc" },
        { id: "voided_sale", type: "income", amount: 110, accountId: "bank", chartAccountId: "coa_sales", date: "2026-01-10", gstMode: "inc", voidedAt: "2026-01-11T00:00:00.000Z" },
      ],
    });

    const report = basReport(data, "2026-01-01", "2026-01-31");

    assert.equal(report.salesGross, 110);
    assert.equal(report.gstCollected, 10);
  });
});

describe("validation", () => {
  it("rejects negative transaction amounts", () => {
    const result = validateTransactionInput(ledger(), {
      id: "bad",
      type: "expense",
      amount: -10,
      accountId: "bank",
      chartAccountId: "coa_supplies",
      date: "2026-01-10",
    });

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /greater than zero/);
  });

  it("rejects transactions in locked periods", () => {
    const data = ledger({
      periodLocks: [{ id: "lock_1", lockedThrough: "2026-01-31", createdAt: "2026-02-01T00:00:00.000Z" }],
    });

    const result = validateTransactionInput(data, {
      id: "locked",
      type: "income",
      amount: 10,
      accountId: "bank",
      chartAccountId: "coa_sales",
      date: "2026-01-10",
    });

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /locked period/);
  });

  it("rejects payments in locked periods", () => {
    const invoice = {
      id: "inv_1",
      type: "income",
      entryMode: "invoice",
      amount: 100,
      accountId: "bank",
      chartAccountId: "coa_sales",
      clearingChartAccountId: "coa_ar",
      date: "2026-01-15",
      gstMode: "free",
      payments: [],
    };
    const data = ledger({
      transactions: [invoice],
      periodLocks: [{ id: "lock_1", lockedThrough: "2026-01-31", createdAt: "2026-02-01T00:00:00.000Z" }],
    });

    const result = validatePaymentInput(data, invoice, {
      amount: 50,
      date: "2026-01-20",
      accountId: "bank",
    });

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /locked period/);
  });

  it("rejects payments above outstanding balance", () => {
    const invoice = {
      id: "inv_1",
      type: "income",
      entryMode: "invoice",
      amount: 100,
      accountId: "bank",
      chartAccountId: "coa_sales",
      clearingChartAccountId: "coa_ar",
      date: "2026-01-15",
      gstMode: "free",
      payments: [{ id: "p_1", amount: 80, date: "2026-01-20", accountId: "bank" }],
    };
    const data = ledger({ transactions: [invoice] });

    const result = validatePaymentInput(data, invoice, {
      amount: 25,
      date: "2026-02-01",
      accountId: "bank",
    });

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /outstanding balance/);
  });

  it("rejects credit allocations above credit note and invoice balances", () => {
    const creditNote = {
      id: "cn_1",
      type: "income",
      entryMode: "credit_note",
      amount: 50,
      chartAccountId: "coa_sales",
      clearingChartAccountId: "coa_ar",
      date: "2026-01-21",
      gstMode: "free",
    };
    const invoice = {
      id: "inv_1",
      type: "income",
      entryMode: "invoice",
      amount: 40,
      chartAccountId: "coa_sales",
      clearingChartAccountId: "coa_ar",
      date: "2026-01-15",
      gstMode: "free",
      payments: [],
    };
    const data = ledger({ transactions: [creditNote, invoice] });

    const result = validateCreditAllocations(data, [
      { creditNoteId: "cn_1", invoiceId: "inv_1", amount: 60, date: "2026-01-22" },
    ]);

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /credit note balance/);
    assert.match(result.errors.join("\n"), /outstanding balance/);
  });

  it("allows valid partial credit allocations", () => {
    const creditNote = {
      id: "cn_1",
      type: "income",
      entryMode: "credit_note",
      amount: 100,
      chartAccountId: "coa_sales",
      clearingChartAccountId: "coa_ar",
      date: "2026-01-21",
      gstMode: "free",
    };
    const invoice = {
      id: "inv_1",
      type: "income",
      entryMode: "invoice",
      amount: 100,
      chartAccountId: "coa_sales",
      clearingChartAccountId: "coa_ar",
      date: "2026-01-15",
      gstMode: "free",
      payments: [],
    };
    const data = ledger({ transactions: [creditNote, invoice] });

    const result = validateCreditAllocations(data, [
      { creditNoteId: "cn_1", invoiceId: "inv_1", amount: 40, date: "2026-01-22" },
    ]);

    assert.equal(result.ok, true);
  });
});

describe("controls and operational reports", () => {
  it("detects dates covered by period locks", () => {
    const data = ledger({
      periodLocks: [{ id: "lock_1", lockedThrough: "2026-01-31", note: "January closed", createdAt: "2026-02-01T00:00:00.000Z" }],
    });

    assert.equal(isDateLocked(data, "2026-01-31"), true);
    assert.equal(isDateLocked(data, "2026-02-01"), false);
  });

  it("places unpaid invoices into AR aging buckets", () => {
    const data = ledger({
      transactions: [
        {
          id: "inv_current",
          type: "income",
          entryMode: "invoice",
          amount: 110,
          chartAccountId: "coa_sales",
          clearingChartAccountId: "coa_ar",
          date: "2026-01-01",
          dueDate: "2026-02-15",
          gstMode: "inc",
          payments: [],
        },
        {
          id: "inv_30",
          type: "income",
          entryMode: "invoice",
          amount: 220,
          chartAccountId: "coa_sales",
          clearingChartAccountId: "coa_ar",
          date: "2026-01-01",
          dueDate: "2026-01-20",
          gstMode: "inc",
          payments: [{ id: "pay_1", amount: 20, date: "2026-01-25", accountId: "bank" }],
        },
      ],
    });

    const aging = arApAging(data, "income", "2026-02-01");

    assert.equal(aging.total, 310);
    assert.equal(aging.buckets.find((bucket) => bucket.key === "current")?.amount, 110);
    assert.equal(aging.buckets.find((bucket) => bucket.key === "1_30")?.amount, 200);
  });

  it("places unpaid bills into AP aging buckets", () => {
    const data = ledger({
      transactions: [
        {
          id: "bill_current",
          type: "expense",
          entryMode: "invoice",
          amount: 55,
          chartAccountId: "coa_supplies",
          clearingChartAccountId: "coa_ap",
          date: "2026-01-01",
          dueDate: "2026-02-15",
          gstMode: "inc",
          payments: [],
        },
        {
          id: "bill_60",
          type: "expense",
          entryMode: "invoice",
          amount: 110,
          chartAccountId: "coa_supplies",
          clearingChartAccountId: "coa_ap",
          date: "2026-01-01",
          dueDate: "2025-12-15",
          gstMode: "inc",
          payments: [{ id: "pay_1", amount: 10, date: "2026-01-25", accountId: "bank" }],
        },
      ],
    });

    const aging = arApAging(data, "expense", "2026-02-01");

    assert.equal(aging.total, 155);
    assert.equal(aging.buckets.find((bucket) => bucket.key === "current")?.amount, 55);
    assert.equal(aging.buckets.find((bucket) => bucket.key === "31_60")?.amount, 100);
  });

  it("summarizes financial position from opening balances and GST postings", () => {
    const data = ledger({
      accounts: [
        { id: "bank", name: "Bank", type: "bank", initBalance: 1000, icon: "", color: "", chartAccountId: "coa_bank" },
      ],
      transactions: [
        { id: "sale", type: "income", amount: 110, accountId: "bank", chartAccountId: "coa_sales", date: "2026-01-10", gstMode: "inc" },
        { id: "purchase", type: "expense", amount: 55, accountId: "bank", chartAccountId: "coa_supplies", date: "2026-01-11", gstMode: "inc" },
      ],
    });

    assert.deepEqual(financialPosition(data), {
      assets: 1060,
      liabilities: 10,
      equity: 1000,
      revenue: 100,
      expenses: 50,
      netIncome: 50,
      totalEquity: 1050,
      check: 0,
      net: 1050,
    });
  });

  it("includes active manual journals and excludes voided manual journals from financial position", () => {
    const data = ledger({
      manualJournals: [
        {
          id: "mj_1",
          date: "2026-01-15",
          memo: "Accrued expense",
          createdAt: "2026-01-15T00:00:00.000Z",
          lines: [
            { chartAccountId: "coa_supplies", debit: 30, credit: 0 },
            { chartAccountId: "coa_ap", debit: 0, credit: 30 },
          ],
        },
        {
          id: "mj_void",
          date: "2026-01-16",
          memo: "Voided accrued expense",
          createdAt: "2026-01-16T00:00:00.000Z",
          voidedAt: "2026-01-17T00:00:00.000Z",
          lines: [
            { chartAccountId: "coa_supplies", debit: 99, credit: 0 },
            { chartAccountId: "coa_ap", debit: 0, credit: 99 },
          ],
        },
      ],
    });

    assert.deepEqual(financialPosition(data), {
      assets: 0,
      liabilities: 30,
      equity: 0,
      revenue: 0,
      expenses: 30,
      netIncome: -30,
      totalEquity: -30,
      check: 0,
      net: -30,
    });
  });

  it("excludes previously cleared bank ledger rows from reconciliation", () => {
    const data = ledger({
      transactions: [
        { id: "sale_1", type: "income", amount: 110, accountId: "bank", chartAccountId: "coa_sales", date: "2026-01-10", gstMode: "inc" },
        { id: "sale_2", type: "income", amount: 55, accountId: "bank", chartAccountId: "coa_sales", date: "2026-01-20", gstMode: "inc" },
        { id: "future_sale", type: "income", amount: 22, accountId: "bank", chartAccountId: "coa_sales", date: "2026-02-10", gstMode: "inc" },
      ],
      bankReconciliations: [
        {
          id: "rec_1",
          accountId: "bank",
          statementDate: "2026-01-31",
          statementBalance: 110,
          bookBalance: 110,
          difference: 0,
          clearedSourceIds: ["sale_1"],
          createdAt: "2026-02-01T00:00:00.000Z",
          finalizedAt: "2026-02-01T00:00:00.000Z",
        },
      ],
    });

    const rows = reconciliationRows(data, "bank", "2026-01-31");

    assert.deepEqual(rows.map((row) => row.sourceId), ["sale_2"]);
    assert.equal(rows[0]?.movement, 55);
  });
});
