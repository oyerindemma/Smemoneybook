import { describe, expect, it } from "vitest";
import { selectEffectivePayrollCompensation } from "@/lib/payroll/service";

describe("Phase 3I payroll service helpers", () => {
  it("uses the latest compensation effective during the payroll period", () => {
    const compensation = selectEffectivePayrollCompensation(
      [
        {
          id: "old_salary",
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
          effectiveTo: new Date("2026-07-15T00:00:00.000Z"),
        },
        {
          id: "new_salary",
          effectiveFrom: new Date("2026-07-15T00:00:00.000Z"),
          effectiveTo: null,
        },
      ],
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-08-01T00:00:00.000Z"),
    );

    expect(compensation?.id).toBe("new_salary");
  });

  it("ignores compensation outside the payroll period", () => {
    const compensation = selectEffectivePayrollCompensation(
      [
        {
          id: "future_salary",
          effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
          effectiveTo: null,
        },
      ],
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-08-01T00:00:00.000Z"),
    );

    expect(compensation).toBeUndefined();
  });
});
