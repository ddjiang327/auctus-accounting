import { describe, expect, it } from "vitest";
import { __testing, type ParseContext } from "../ai/service.js";

const context: ParseContext = {
  accounts: [
    { id: "bank_1", name: "Everyday Account", type: "bank" },
    { id: "cash_1", name: "Petty Cash", type: "cash" },
  ],
  categories: {
    income: [{ id: "income_sales", name: "Sales", chartAccountId: "coa_revenue" }],
    expense: [{ id: "expense_office", name: "Office Supplies" }],
  },
  contacts: [
    { id: "cust_1", name: "Customer Co", type: "customer", paymentTerms: "net_14" },
    { id: "supp_1", name: "Supplier Co", type: "supplier", paymentTerms: "net_60" },
  ],
  chartOfAccounts: [
    { id: "coa_revenue", code: "4000", name: "Sales Revenue", class: "revenue" },
    { id: "coa_revenue_alt", code: "4010", name: "Service Revenue", class: "revenue" },
    { id: "coa_expense", code: "7030", name: "Office Supplies", class: "expense" },
  ],
  gstEnabled: true,
  today: "2026-06-25",
};

describe("AI parse draft normalization", () => {
  it("removes hallucinated references and flags required fields for user review", () => {
    const draft = __testing.normalizeDraft({
      type: "expense",
      amount: 0,
      date: "not-a-date",
      accountId: "missing_account",
      categoryId: "income_sales",
      chartAccountId: "coa_revenue",
      contactId: "cust_1",
      entryMode: "unexpected",
      gstMode: "unexpected",
      missingFields: ["category"],
    }, context);

    expect(draft).toMatchObject({
      type: "expense",
      amount: 0,
      date: "2026-06-25",
      accountId: undefined,
      categoryId: undefined,
      chartAccountId: "coa_expense",
      contactId: undefined,
      entryMode: "cash",
      gstMode: "inc",
    });
    expect(draft.missingFields).toEqual(["category", "amount", "account"]);
    expect(draft.clarification).toBe("Can you confirm the category, amount, account?");
  });

  it("keeps model clarification when missing fields need review", () => {
    const draft = __testing.normalizeDraft({
      type: "expense",
      amount: 0,
      accountId: "bank_1",
      categoryId: "expense_office",
      missingFields: ["amount"],
      clarification: "What was the total paid?",
    }, context);

    expect(draft.missingFields).toEqual(["amount"]);
    expect(draft.clarification).toBe("What was the total paid?");
  });

  it("merges clarification updates without carrying stale review fields", () => {
    const merged = __testing.mergeDraftUpdate({
      type: "expense",
      amount: 0,
      date: "2026-06-18",
      note: "Officeworks printer paper",
      entryMode: "cash",
      missingFields: ["amount", "account"],
      clarification: "Can you confirm the amount, account?",
    }, {
      amount: 123.45,
      accountId: "bank_1",
    });
    const draft = __testing.normalizeDraft(merged, context);

    expect(draft).toMatchObject({
      amount: 123.45,
      accountId: "bank_1",
      note: "Officeworks printer paper",
      missingFields: ["category"],
      clarification: "Can you confirm the category?",
    });
  });

  it("normalizes transfers to source and destination accounts only", () => {
    const draft = __testing.normalizeDraft({
      type: "transfer",
      amount: 500,
      accountId: "bank_1",
      accountToId: "cash_1",
      categoryId: "expense_office",
      chartAccountId: "coa_expense",
      contactId: "supp_1",
      entryMode: "invoice",
      gstMode: "inc",
      missingFields: [],
    }, context);

    expect(draft).toMatchObject({
      type: "transfer",
      amount: 500,
      accountId: "bank_1",
      accountToId: "cash_1",
      categoryId: undefined,
      chartAccountId: undefined,
      contactId: undefined,
      entryMode: "cash",
      gstMode: null,
      missingFields: [],
    });
  });

  it("normalizes natural language transaction types", () => {
    const sale = __testing.normalizeDraft({
      type: "sale",
      amount: 300,
      accountId: "bank_1",
      categoryId: "income_sales",
      missingFields: [],
    } as unknown, context);
    const purchase = __testing.normalizeDraft({
      type: "purchase",
      amount: 45,
      accountId: "bank_1",
      categoryId: "expense_office",
      missingFields: [],
    } as unknown, context);
    const transfer = __testing.normalizeDraft({
      type: "move money",
      amount: 100,
      accountId: "bank_1",
      accountToId: "cash_1",
      missingFields: [],
    } as unknown, context);

    expect(sale).toMatchObject({
      type: "income",
      categoryId: "income_sales",
      chartAccountId: "coa_revenue",
      missingFields: [],
    });
    expect(purchase).toMatchObject({
      type: "expense",
      categoryId: "expense_office",
      chartAccountId: "coa_expense",
      missingFields: [],
    });
    expect(transfer).toMatchObject({
      type: "transfer",
      accountToId: "cash_1",
      categoryId: undefined,
      missingFields: [],
    });
  });

  it("matches account and category names when AI returns labels instead of ids", () => {
    const draft = __testing.normalizeDraft({
      type: "expense",
      amount: 49,
      accountId: "everyday account",
      categoryId: "office supplies",
      missingFields: [],
    }, context);
    const transfer = __testing.normalizeDraft({
      type: "transfer",
      amount: 100,
      accountId: "Everyday Account",
      accountToId: "petty cash",
      missingFields: [],
    }, context);

    expect(draft).toMatchObject({
      accountId: "bank_1",
      categoryId: "expense_office",
      missingFields: [],
    });
    expect(transfer).toMatchObject({
      accountId: "bank_1",
      accountToId: "cash_1",
      missingFields: [],
    });
  });

  it("asks for confirmation instead of choosing ambiguous account or category names", () => {
    const draft = __testing.normalizeDraft({
      type: "expense",
      amount: 88,
      accountId: "Everyday Account",
      categoryId: "Office Supplies",
      missingFields: [],
    }, {
      ...context,
      accounts: [
        ...context.accounts,
        { id: "bank_2", name: "Everyday Account", type: "bank" },
      ],
      categories: {
        ...context.categories,
        expense: [
          ...context.categories.expense,
          { id: "expense_office_alt", name: "Office Supplies" },
        ],
      },
    });

    expect(draft).toMatchObject({
      amount: 88,
      accountId: undefined,
      categoryId: undefined,
    });
    expect(draft.missingFields).toEqual(["account", "category"]);
    expect(draft.clarification).toBe("Can you confirm the account, category?");
  });

  it("normalizes strict amount strings but rejects vague amount text", () => {
    const amountString = __testing.normalizeDraft({
      type: "expense",
      amount: "$1,234.50",
      accountId: "bank_1",
      categoryId: "expense_office",
      missingFields: [],
    } as unknown, context);
    const vagueAmount = __testing.normalizeDraft({
      type: "expense",
      amount: "about 50",
      accountId: "bank_1",
      categoryId: "expense_office",
      missingFields: [],
    } as unknown, context);
    const negativeAmount = __testing.normalizeDraft({
      type: "expense",
      amount: "-$42.75",
      accountId: "bank_1",
      categoryId: "expense_office",
      missingFields: [],
    } as unknown, context);

    expect(amountString).toMatchObject({
      amount: 1234.5,
      missingFields: [],
    });
    expect(vagueAmount).toMatchObject({
      amount: 0,
      missingFields: ["amount"],
    });
    expect(negativeAmount).toMatchObject({
      type: "expense",
      amount: 42.75,
      missingFields: [],
    });
  });

  it("normalizes natural language GST modes", () => {
    const plusGst = __testing.normalizeDraft({
      type: "expense",
      amount: 80,
      accountId: "bank_1",
      categoryId: "expense_office",
      gstMode: "plus GST",
      missingFields: [],
    } as unknown, context);
    const gstFree = __testing.normalizeDraft({
      type: "expense",
      amount: 80,
      accountId: "bank_1",
      categoryId: "expense_office",
      gstMode: "GST free",
      missingFields: [],
    } as unknown, context);
    const included = __testing.normalizeDraft({
      type: "expense",
      amount: 80,
      accountId: "bank_1",
      categoryId: "expense_office",
      gstMode: "includes gst",
      missingFields: [],
    } as unknown, context);

    expect(plusGst.gstMode).toBe("exc");
    expect(gstFree.gstMode).toBe("free");
    expect(included.gstMode).toBe("inc");
  });

  it("preserves credit note entry mode for non-transfer drafts", () => {
    const draft = __testing.normalizeDraft({
      type: "income",
      amount: 75,
      accountId: "bank_1",
      categoryId: "income_sales",
      chartAccountId: "coa_revenue",
      contactId: "cust_1",
      entryMode: "credit_note",
      paymentTerms: "net_30",
      missingFields: [],
    }, context);

    expect(draft).toMatchObject({
      type: "income",
      amount: 75,
      accountId: "bank_1",
      categoryId: "income_sales",
      chartAccountId: "coa_revenue",
      contactId: "cust_1",
      entryMode: "credit_note",
      paymentTerms: undefined,
      missingFields: [],
    });
  });

  it("normalizes natural language entry modes", () => {
    const bill = __testing.normalizeDraft({
      type: "expense",
      amount: 220,
      date: "2026-06-20",
      accountId: "bank_1",
      categoryId: "expense_office",
      entryMode: "bill",
      paymentTerms: "net 14",
      missingFields: [],
    } as unknown, context);
    const supplierCredit = __testing.normalizeDraft({
      type: "expense",
      amount: 50,
      accountId: "bank_1",
      categoryId: "expense_office",
      entryMode: "supplier credit",
      missingFields: [],
    } as unknown, context);
    const receipt = __testing.normalizeDraft({
      type: "income",
      amount: 50,
      accountId: "bank_1",
      categoryId: "income_sales",
      entryMode: "receipt",
      paymentTerms: "net 30",
      missingFields: [],
    } as unknown, context);

    expect(bill).toMatchObject({
      entryMode: "invoice",
      paymentTerms: "net_14",
      dueDate: "2026-07-04",
    });
    expect(supplierCredit.entryMode).toBe("credit_note");
    expect(receipt).toMatchObject({
      entryMode: "cash",
      paymentTerms: undefined,
      dueDate: undefined,
    });
  });

  it("uses the category default chart account before a mismatched AI chart account", () => {
    const draft = __testing.normalizeDraft({
      type: "income",
      amount: 200,
      accountId: "bank_1",
      categoryId: "income_sales",
      chartAccountId: "coa_revenue_alt",
      entryMode: "cash",
      missingFields: [],
    }, context);

    expect(draft).toMatchObject({
      type: "income",
      categoryId: "income_sales",
      chartAccountId: "coa_revenue",
      missingFields: [],
    });
  });

  it("fills a default chart account but still requires a category when AI omits one", () => {
    const expense = __testing.normalizeDraft({
      type: "expense",
      amount: 35,
      accountId: "bank_1",
      missingFields: [],
    }, context);
    const income = __testing.normalizeDraft({
      type: "income",
      amount: 35,
      accountId: "bank_1",
      missingFields: [],
    }, context);

    expect(expense.chartAccountId).toBe("coa_expense");
    expect(expense.missingFields).toContain("category");
    expect(income.chartAccountId).toBe("coa_revenue_alt");
    expect(income.missingFields).toContain("category");
  });

  it("derives invoice due date from payment terms", () => {
    const draft = __testing.normalizeDraft({
      type: "income",
      amount: 500,
      date: "2026-06-10",
      accountId: "bank_1",
      entryMode: "invoice",
      paymentTerms: "net_30",
      missingFields: [],
    }, context);

    expect(draft).toMatchObject({
      entryMode: "invoice",
      paymentTerms: "net_30",
      dueDate: "2026-07-10",
    });
  });

  it("normalizes natural language payment terms", () => {
    const netThirty = __testing.normalizeDraft({
      type: "income",
      amount: 500,
      date: "2026-06-10",
      accountId: "bank_1",
      categoryId: "income_sales",
      entryMode: "invoice",
      paymentTerms: "Net 30",
      missingFields: [],
    } as unknown, context);
    const dueNow = __testing.normalizeDraft({
      type: "income",
      amount: 500,
      date: "2026-06-10",
      accountId: "bank_1",
      categoryId: "income_sales",
      entryMode: "invoice",
      paymentTerms: "due on receipt",
      missingFields: [],
    } as unknown, context);

    expect(netThirty).toMatchObject({
      paymentTerms: "net_30",
      dueDate: "2026-07-10",
    });
    expect(dueNow).toMatchObject({
      paymentTerms: "due_on_receipt",
      dueDate: "2026-06-10",
    });
  });

  it("normalizes common AI date formats without guessing ambiguous years", () => {
    const numericDate = __testing.normalizeDraft({
      type: "expense",
      amount: 42,
      date: "20/06/2026",
      accountId: "bank_1",
      categoryId: "expense_office",
      missingFields: [],
    }, context);
    const monthDate = __testing.normalizeDraft({
      type: "income",
      amount: 500,
      date: "June 20, 2026",
      dueDate: "21 July 2026",
      accountId: "bank_1",
      categoryId: "income_sales",
      entryMode: "invoice",
      paymentTerms: "net_30",
      missingFields: [],
    }, context);
    const ambiguousDate = __testing.normalizeDraft({
      type: "expense",
      amount: 42,
      date: "20/06/26",
      accountId: "bank_1",
      categoryId: "expense_office",
      missingFields: [],
    }, context);

    expect(numericDate.date).toBe("2026-06-20");
    expect(monthDate.date).toBe("2026-06-20");
    expect(monthDate.dueDate).toBe("2026-07-21");
    expect(ambiguousDate.date).toBe("2026-06-25");
  });

  it("preserves invoice and credit note numbers for matching entry modes", () => {
    const invoice = __testing.normalizeDraft({
      type: "income",
      amount: 100,
      accountId: "bank_1",
      entryMode: "invoice",
      invoiceNo: " INV-AI-42 ",
      creditNoteNo: "CN-IGNORED",
      missingFields: [],
    }, context);
    const credit = __testing.normalizeDraft({
      type: "income",
      amount: 50,
      accountId: "bank_1",
      entryMode: "credit_note",
      invoiceNo: "INV-IGNORED",
      creditNoteNo: " CN-AI-7 ",
      missingFields: [],
    }, context);

    expect(invoice.invoiceNo).toBe("INV-AI-42");
    expect(invoice.creditNoteNo).toBeUndefined();
    expect(credit.creditNoteNo).toBe("CN-AI-7");
    expect(credit.invoiceNo).toBeUndefined();
  });

  it("flags invoice party names that did not match a known contact", () => {
    const draft = __testing.normalizeDraft({
      type: "income",
      amount: 250,
      accountId: "bank_1",
      entryMode: "invoice",
      party: "  New Customer  ",
      note: "  Setup services  ",
      missingFields: [],
    }, context);
    const cashDraft = __testing.normalizeDraft({
      type: "expense",
      amount: 20,
      accountId: "bank_1",
      entryMode: "cash",
      party: "  Officeworks  ",
      missingFields: [],
    }, context);

    expect(draft.party).toBe("New Customer");
    expect(draft.note).toBe("Setup services");
    expect(draft.missingFields).toContain("contact");
    expect(cashDraft.missingFields).not.toContain("contact");
  });

  it("matches invoice parties to known contacts and applies default terms", () => {
    const customerInvoice = __testing.normalizeDraft({
      type: "income",
      amount: 250,
      date: "2026-06-10",
      accountId: "bank_1",
      categoryId: "income_sales",
      entryMode: "invoice",
      party: " customer co ",
      missingFields: [],
    }, context);
    const supplierBill = __testing.normalizeDraft({
      type: "expense",
      amount: 125,
      date: "2026-06-10",
      accountId: "bank_1",
      categoryId: "expense_office",
      entryMode: "invoice",
      party: "Supplier Co",
      missingFields: [],
    }, context);
    const wrongType = __testing.normalizeDraft({
      type: "income",
      amount: 125,
      accountId: "bank_1",
      categoryId: "income_sales",
      entryMode: "invoice",
      party: "Supplier Co",
      missingFields: [],
    }, context);

    expect(customerInvoice).toMatchObject({
      contactId: "cust_1",
      paymentTerms: "net_14",
      dueDate: "2026-06-24",
      missingFields: [],
    });
    expect(supplierBill).toMatchObject({
      contactId: "supp_1",
      paymentTerms: "net_60",
      dueDate: "2026-08-09",
      missingFields: [],
    });
    expect(wrongType.contactId).toBeUndefined();
    expect(wrongType.missingFields).toContain("contact");
  });
});
