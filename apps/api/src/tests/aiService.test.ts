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
    { id: "cust_1", name: "Customer Co", type: "customer" },
    { id: "supp_1", name: "Supplier Co", type: "supplier" },
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
      amount: -10,
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
      chartAccountId: undefined,
      contactId: undefined,
      entryMode: "cash",
      gstMode: "inc",
    });
    expect(draft.missingFields).toEqual(["category", "amount", "account"]);
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
});
