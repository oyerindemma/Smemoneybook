import { describe, expect, it } from "vitest";
import {
  assertPayrollRunCanBeRecalculated,
  calculatePayrollRun,
  payrollRuleVersion,
  redactPayrollIdentifier,
} from "@/lib/phase3/payroll";

describe("Phase 3J payroll calculations", () => {
  it("calculates gross pay, deductions, net pay, and rule version from explicit inputs", () => {
    const calculation = calculatePayrollRun({
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-08-01T00:00:00.000Z"),
      payDate: new Date("2026-07-31T00:00:00.000Z"),
      employees: [
        {
          employeeId: "employee_1",
          displayName: "Ada",
          baseSalary: 100_000,
          allowances: [{ label: "Transport", amount: 10_000 }],
          bonuses: [{ label: "Sales bonus", amount: 5_000 }],
          deductions: [{ label: "Co-op", amount: 3_000 }],
          loansAndAdvances: [{ label: "Salary advance", amount: 7_000 }],
          pensionEmployeeAmount: 8_000,
          pensionEmployerAmount: 10_000,
          taxAmount: 5_000,
        },
      ],
    });

    expect(calculation.ruleVersion).toBe(payrollRuleVersion);
    expect(calculation.grossPay).toBe(115_000);
    expect(calculation.totalDeductions).toBe(23_000);
    expect(calculation.netPay).toBe(92_000);
    expect(calculation.employerPensionTotal).toBe(10_000);
    expect(calculation.disclaimer).toContain("not tax");
  });

  it("warns instead of producing a negative net pay", () => {
    const calculation = calculatePayrollRun({
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-08-01T00:00:00.000Z"),
      payDate: new Date("2026-07-31T00:00:00.000Z"),
      employees: [
        {
          employeeId: "employee_1",
          displayName: "Ada",
          baseSalary: 10_000,
          deductions: [{ label: "Advance", amount: 20_000 }],
        },
      ],
    });

    expect(calculation.netPay).toBe(0);
    expect(calculation.warnings.join(" ")).toContain("deductions higher than gross pay");
  });

  it("does not allow completed payroll runs to be recalculated silently", () => {
    expect(() =>
      assertPayrollRunCanBeRecalculated({
        status: "LOCKED",
        lockedAt: new Date("2026-07-31T00:00:00.000Z"),
      }),
    ).toThrow("Completed payroll runs cannot be recalculated");
  });

  it("redacts sensitive payroll identifiers", () => {
    expect(redactPayrollIdentifier("PEN123456789")).toBe("****6789");
    expect(redactPayrollIdentifier("123")).toBe("****");
    expect(redactPayrollIdentifier(null)).toBeNull();
  });
});
