import { describe, expect, it } from "vitest";
import { DEFAULT_CHART_ACCOUNTS } from "../ledger/defaultSeed.js";

describe("default chart account seed", () => {
  it("includes the accounts required by inventory and payroll journals", () => {
    const codes = DEFAULT_CHART_ACCOUNTS.map((account) => account.code);

    expect(codes).toEqual(expect.arrayContaining(["1220", "5040", "2400", "2410", "2420", "7080", "7090"]));
  });
});
