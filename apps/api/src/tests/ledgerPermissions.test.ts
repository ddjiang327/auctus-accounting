import { describe, expect, it } from "vitest";

import { canRoleViewPayroll } from "../ledger/service.js";

describe("ledger payroll visibility", () => {
  it.each(["owner", "admin", "bookkeeper"] as const)("allows %s to view payroll data", (role) => {
    expect(canRoleViewPayroll(role)).toBe(true);
  });

  it("blocks viewers from payroll data in ledger snapshots", () => {
    expect(canRoleViewPayroll("viewer")).toBe(false);
  });
});
