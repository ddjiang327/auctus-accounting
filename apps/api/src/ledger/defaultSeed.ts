import type { AccountType, ChartAccountClass } from "@auctus/shared-types";

type SeedChartAccount = {
  code: string;
  name: string;
  class: ChartAccountClass;
  groupName: string;
  normalBalance: "debit" | "credit";
  isContra?: boolean;
};

type SeedPaymentAccount = {
  name: string;
  type: AccountType;
  initBalance: number;
  icon: string;
  color: string;
  chartCode: string;
};

type SeedCategory = {
  type: "income" | "expense";
  name: string;
  icon: string;
  color: string;
  chartCode: string;
};

export const DEFAULT_CHART_ACCOUNTS: SeedChartAccount[] = [
  { code: "1000", name: "Petty Cash", class: "asset", groupName: "Current Assets - Cash", normalBalance: "debit" },
  { code: "1010", name: "Checking Account", class: "asset", groupName: "Current Assets - Cash", normalBalance: "debit" },
  { code: "1020", name: "Savings Account", class: "asset", groupName: "Current Assets - Cash", normalBalance: "debit" },
  { code: "1030", name: "Digital Wallet", class: "asset", groupName: "Current Assets - Cash", normalBalance: "debit" },
  { code: "1100", name: "Accounts Receivable", class: "asset", groupName: "Current Assets", normalBalance: "debit" },
  { code: "1130", name: "GST Paid / Input Tax Credits", class: "asset", groupName: "Current Assets - GST", normalBalance: "debit" },
  { code: "1200", name: "Inventory - Raw Materials", class: "asset", groupName: "Current Assets - Inventory", normalBalance: "debit" },
  { code: "1210", name: "Inventory - Work-in-Progress", class: "asset", groupName: "Current Assets - Inventory", normalBalance: "debit" },
  { code: "1220", name: "Inventory - Finished Goods", class: "asset", groupName: "Current Assets - Inventory", normalBalance: "debit" },
  { code: "1400", name: "Short-term Investments", class: "asset", groupName: "Current Assets", normalBalance: "debit" },
  { code: "2000", name: "Accounts Payable", class: "liability", groupName: "Current Liabilities", normalBalance: "credit" },
  { code: "2120", name: "Taxes Payable", class: "liability", groupName: "Current Liabilities - Accrued Liabilities", normalBalance: "credit" },
  { code: "2130", name: "GST Collected", class: "liability", groupName: "Current Liabilities - GST", normalBalance: "credit" },
  { code: "2200", name: "Short-term Debt", class: "liability", groupName: "Current Liabilities", normalBalance: "credit" },
  { code: "2400", name: "PAYG Withholding Payable", class: "liability", groupName: "Current Liabilities - Payroll", normalBalance: "credit" },
  { code: "2410", name: "Superannuation Payable", class: "liability", groupName: "Current Liabilities - Payroll", normalBalance: "credit" },
  { code: "2420", name: "Payroll Deductions Payable", class: "liability", groupName: "Current Liabilities - Payroll", normalBalance: "credit" },
  { code: "2500", name: "Bank Loans Payable", class: "liability", groupName: "Long-term Liabilities", normalBalance: "credit" },
  { code: "3000", name: "Owner's Capital", class: "equity", groupName: "Equity", normalBalance: "credit" },
  { code: "3100", name: "Retained Earnings", class: "equity", groupName: "Equity", normalBalance: "credit" },
  { code: "3150", name: "Opening Balance Equity", class: "equity", groupName: "Equity", normalBalance: "credit" },
  { code: "3200", name: "Owner's Drawings / Dividends", class: "equity", groupName: "Equity - Contra Equity", normalBalance: "debit", isContra: true },
  { code: "4000", name: "Sales Revenue", class: "revenue", groupName: "Revenue", normalBalance: "credit" },
  { code: "4010", name: "Service Revenue", class: "revenue", groupName: "Revenue", normalBalance: "credit" },
  { code: "4100", name: "Interest Income", class: "revenue", groupName: "Other Revenue", normalBalance: "credit" },
  { code: "4110", name: "Rental Income", class: "revenue", groupName: "Other Revenue", normalBalance: "credit" },
  { code: "5000", name: "Cost of Goods Sold", class: "expense", groupName: "Cost of Goods Sold", normalBalance: "debit" },
  { code: "5040", name: "Inventory Adjustments", class: "expense", groupName: "Cost of Goods Sold", normalBalance: "debit" },
  { code: "6000", name: "Advertising & Marketing", class: "expense", groupName: "Selling Expenses", normalBalance: "debit" },
  { code: "6020", name: "Delivery / Freight-out", class: "expense", groupName: "Selling Expenses", normalBalance: "debit" },
  { code: "7000", name: "Salaries & Wages", class: "expense", groupName: "General & Administrative", normalBalance: "debit" },
  { code: "7010", name: "Rent Expense", class: "expense", groupName: "General & Administrative", normalBalance: "debit" },
  { code: "7020", name: "Utilities", class: "expense", groupName: "General & Administrative", normalBalance: "debit" },
  { code: "7030", name: "Office Supplies", class: "expense", groupName: "General & Administrative", normalBalance: "debit" },
  { code: "7040", name: "Insurance Expense", class: "expense", groupName: "General & Administrative", normalBalance: "debit" },
  { code: "7070", name: "Bank & Merchant Fees", class: "expense", groupName: "General & Administrative", normalBalance: "debit" },
  { code: "7080", name: "Superannuation Expense", class: "expense", groupName: "General & Administrative", normalBalance: "debit" },
  { code: "7090", name: "Employee Reimbursements", class: "expense", groupName: "General & Administrative", normalBalance: "debit" },
  { code: "8000", name: "Interest Expense", class: "expense", groupName: "Other Expenses", normalBalance: "debit" },
  { code: "8010", name: "Income Tax Expense", class: "expense", groupName: "Other Expenses", normalBalance: "debit" },
];

export const DEFAULT_PAYMENT_ACCOUNTS: SeedPaymentAccount[] = [
  { name: "Cash", type: "cash", initBalance: 0, icon: "cash", color: "#34C759", chartCode: "1000" },
  { name: "Everyday Account", type: "bank", initBalance: 0, icon: "bank", color: "#007AFF", chartCode: "1010" },
  { name: "Savings", type: "bank", initBalance: 0, icon: "bank", color: "#5AC8FA", chartCode: "1020" },
  { name: "PayPal", type: "ewallet", initBalance: 0, icon: "phone", color: "#0099FF", chartCode: "1030" },
  { name: "Credit Card", type: "credit", initBalance: 0, icon: "card", color: "#FF3B30", chartCode: "2200" },
];

export const DEFAULT_CATEGORIES: SeedCategory[] = [
  { type: "expense", name: "Groceries", icon: "cart", color: "#FF6B6B", chartCode: "7030" },
  { type: "expense", name: "Dining Out", icon: "utensils", color: "#FF2D55", chartCode: "7030" },
  { type: "expense", name: "Fuel", icon: "fuel", color: "#FF9500", chartCode: "6020" },
  { type: "expense", name: "Transport", icon: "bus", color: "#4ECDC4", chartCode: "6020" },
  { type: "expense", name: "Shopping", icon: "bag", color: "#AF52DE", chartCode: "7030" },
  { type: "expense", name: "Entertainment", icon: "film", color: "#5856D6", chartCode: "7030" },
  { type: "expense", name: "Rent / Mortgage", icon: "home", color: "#FF6482", chartCode: "7010" },
  { type: "expense", name: "Utilities", icon: "lightbulb", color: "#FFCC00", chartCode: "7020" },
  { type: "expense", name: "Health", icon: "medical", color: "#34C759", chartCode: "7030" },
  { type: "expense", name: "Phone & Internet", icon: "phone", color: "#5AC8FA", chartCode: "7020" },
  { type: "expense", name: "Tax & Fees", icon: "receipt", color: "#8E8E93", chartCode: "8010" },
  { type: "expense", name: "Building / Reno", icon: "hammer", color: "#FF9500", chartCode: "7030" },
  { type: "expense", name: "Other", icon: "box", color: "#8E8E93", chartCode: "7030" },
  { type: "income", name: "Salary", icon: "briefcase", color: "#34C759", chartCode: "4010" },
  { type: "income", name: "Bonus", icon: "gift", color: "#FFCC00", chartCode: "4010" },
  { type: "income", name: "Interest", icon: "bank", color: "#5856D6", chartCode: "4100" },
  { type: "income", name: "Dividends", icon: "chart", color: "#5856D6", chartCode: "4010" },
  { type: "income", name: "Freelance", icon: "laptop", color: "#FF9500", chartCode: "4010" },
  { type: "income", name: "Rental Income", icon: "home", color: "#5856D6", chartCode: "4110" },
  { type: "income", name: "Refund", icon: "undo", color: "#5AC8FA", chartCode: "4010" },
  { type: "income", name: "Other Income", icon: "cash", color: "#8E8E93", chartCode: "4010" },
];
