import { describe, expect, it } from "vitest";
import {
  assertPayrollRunCanBeRecalculated,
  calculatePayrollRun,
} from "@/lib/payroll/calculator";
import { payrollCalculationVersion, maskBankAccount } from "@/lib/payroll/definitions";

describe("Phase 3I payroll calculator", () => {
  it("calculates gross pay, deductions, and net pay with decimal-safe arithmetic", () => {
    const calculation = calculatePayrollRun({
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-08-01T00:00:00.000Z"),
      payDate: new Date("2026-07-31T00:00:00.000Z"),
      employees: [
        {
          employeeId: "employee_1",
          displayName: "Ada",
          baseSalary: 100000.1,
          allowances: [{ label: "Transport", amount: 10000.2, type: "allowance", taxable: true }],
          deductions: [{ label: "Welfare", amount: 3000.3, type: "deduction" }],
        },
      ],
    });

    expect(calculation.calculationVersion).toBe(payrollCalculationVersion);
    expect(calculation.grossPay).toBe(110000.3);
    expect(calculation.totalDeductions).toBe(3000.3);
    expect(calculation.netPay).toBe(107000);
  });

  it("does not fabricate statutory deductions when verified rules are absent", () => {
    const calculation = calculatePayrollRun({
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-08-01T00:00:00.000Z"),
      payDate: new Date("2026-07-31T00:00:00.000Z"),
      employees: [
        {
          employeeId: "employee_1",
          displayName: "Ada",
          baseSalary: 100000,
          pensionEmployeeAmount: 8000,
          taxAmount: 5000,
          deductions: [{ label: "PAYE", amount: 5000, type: "deduction", statutory: true }],
        },
      ],
    });

    expect(calculation.statutorySetupStatus).toBe("setup_required");
    expect(calculation.totalDeductions).toBe(0);
    expect(calculation.warnings.join(" ")).toContain("setup required");
  });

  it("applies reviewed statutory inputs when verified source setup is configured", () => {
    const calculation = calculatePayrollRun({
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-08-01T00:00:00.000Z"),
      payDate: new Date("2026-07-31T00:00:00.000Z"),
      statutorySetup: {
        status: "configured",
        version: "phase3i-statutory-rules-ng-configured-v1",
        message: "Verified statutory payroll sources are configured.",
        rules: [
          {
            id: "ng-paye-tax-act-2025-v1",
            country: "NG",
            ruleType: "PAYE",
            effectiveFrom: "2026-01-01",
            thresholds: [{ band: "reviewed" }],
            officialSource: "https://www.nrs.gov.ng/uploads/NIGERIA_TAX_ACT_2025_ef6bb812a5.pdf",
            verificationDate: "2026-07-30",
            status: "verified",
          },
        ],
      },
      employees: [
        {
          employeeId: "employee_1",
          displayName: "Ada",
          baseSalary: 100000,
          pensionEmployeeAmount: 8000,
          pensionEmployerAmount: 10000,
          taxAmount: 5000,
          deductions: [{ label: "NHF", amount: 2500, type: "deduction", statutory: true }],
        },
      ],
    });

    expect(calculation.statutorySetupStatus).toBe("configured");
    expect(calculation.totalDeductions).toBe(15500);
    expect(calculation.employerContributionTotal).toBe(10000);
    expect(calculation.warnings).toEqual([]);
    expect(calculation.disclaimer).toContain("reviewed payroll inputs");
  });

  it("blocks recalculation after approval or posting", () => {
    expect(() =>
      assertPayrollRunCanBeRecalculated({
        status: "APPROVED",
        lockedAt: new Date("2026-07-31T00:00:00.000Z"),
      }),
    ).toThrow("Approved payroll periods cannot be recalculated");
  });

  it("masks bank accounts and short identifiers", () => {
    expect(maskBankAccount("1234567890")).toBe("****7890");
    expect(maskBankAccount("123")).toBe("****");
  });
});
