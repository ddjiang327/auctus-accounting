import type { SupabaseServiceClient } from "../supabase/client.js";
import { DEFAULT_CATEGORIES, DEFAULT_CHART_ACCOUNTS, DEFAULT_PAYMENT_ACCOUNTS } from "./defaultSeed.js";

export class AccountingSeedError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const seedAccountingFoundation = async (
  supabase: SupabaseServiceClient,
  businessId: string,
): Promise<void> => {
  const { count, error: countError } = await supabase
    .from("chart_accounts")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);

  if (countError) {
    throw new AccountingSeedError("accounting_seed_failed", countError.message);
  }

  if ((count ?? 0) > 0) {
    return;
  }

  const { data: chartAccounts, error: chartAccountsError } = await supabase
    .from("chart_accounts")
    .insert(
      DEFAULT_CHART_ACCOUNTS.map((account) => ({
        business_id: businessId,
        code: account.code,
        name: account.name,
        class: account.class,
        group_name: account.groupName,
        normal_balance: account.normalBalance,
        is_contra: account.isContra ?? false,
      })),
    )
    .select("id,code");

  if (chartAccountsError || !chartAccounts) {
    throw new AccountingSeedError(
      "chart_accounts_seed_failed",
      chartAccountsError?.message ?? "No chart accounts returned.",
    );
  }

  const chartAccountIdByCode = new Map(
    ((chartAccounts ?? []) as unknown as { id: string; code: string }[]).map((account) => [account.code, account.id]),
  );
  const chartAccountIdForCode = (code: string): string => {
    const id = chartAccountIdByCode.get(code);
    if (!id) {
      throw new AccountingSeedError("chart_accounts_seed_failed", `Missing seeded chart account ${code}.`);
    }
    return id;
  };

  const { error: paymentAccountsError } = await supabase.from("payment_accounts").insert(
    DEFAULT_PAYMENT_ACCOUNTS.map((account) => ({
      business_id: businessId,
      name: account.name,
      type: account.type,
      init_balance: account.initBalance,
      icon: account.icon,
      color: account.color,
      chart_account_id: chartAccountIdForCode(account.chartCode),
    })),
  );

  if (paymentAccountsError) {
    throw new AccountingSeedError("payment_accounts_seed_failed", paymentAccountsError.message);
  }

  const { error: categoriesError } = await supabase.from("categories").insert(
    DEFAULT_CATEGORIES.map((category) => ({
      business_id: businessId,
      type: category.type,
      name: category.name,
      icon: category.icon,
      color: category.color,
      chart_account_id: chartAccountIdForCode(category.chartCode),
    })),
  );

  if (categoriesError) {
    throw new AccountingSeedError("categories_seed_failed", categoriesError.message);
  }
};
