import { Prisma } from "@prisma/client";

export const payrollRuleVersion = "phase3i-payroll-custom-inputs-v1";
export const payrollCalculationVersion = "phase3i-payroll-calculation-v1";
export const payrollSnapshotVersion = "phase3i-payroll-snapshot-v1";

export const payrollStatuses = [
  "DRAFT",
  "CALCULATED",
  "UNDER_REVIEW",
  "APPROVED",
  "EXPENSE_POSTED",
  "CANCELLED",
  "REVERSED",
  "LOCKED",
] as const;

export type PayrollStatus = (typeof payrollStatuses)[number];

export const payrollComponentTypes = ["allowance", "deduction", "employer_contribution"] as const;
export type PayrollComponentType = (typeof payrollComponentTypes)[number];

export const payrollCalculationMethods = ["fixed_amount", "percentage_of_base", "manual"] as const;
export type PayrollCalculationMethod = (typeof payrollCalculationMethods)[number];

export type PayrollMoneyLine = {
  label: string;
  amount: number;
  type?: PayrollComponentType;
  taxable?: boolean;
  pensionable?: boolean;
  statutory?: boolean;
  calculationMethod?: PayrollCalculationMethod;
};

export type PayrollEmployeeCalculationInput = {
  employeeId: string;
  employeeNumber?: string | null;
  displayName: string;
  roleTitle?: string | null;
  baseSalary: number | Prisma.Decimal;
  currency?: string;
  payFrequency?: string;
  paymentMethod?: string | null;
  maskedBankAccount?: string | null;
  allowances?: PayrollMoneyLine[];
  bonuses?: PayrollMoneyLine[];
  deductions?: PayrollMoneyLine[];
  loansAndAdvances?: PayrollMoneyLine[];
  pensionEmployeeAmount?: number | Prisma.Decimal;
  pensionEmployerAmount?: number | Prisma.Decimal;
  taxAmount?: number | Prisma.Decimal;
};

export type PayrollRunItemCalculation = {
  employeeId: string;
  employeeNumber?: string | null;
  displayName: string;
  roleTitle?: string | null;
  basePay: number;
  allowances: PayrollMoneyLine[];
  bonuses: PayrollMoneyLine[];
  deductions: PayrollMoneyLine[];
  loansAndAdvances: PayrollMoneyLine[];
  componentSnapshot: PayrollMoneyLine[];
  grossPay: number;
  taxablePay: number;
  pensionEmployeeAmount: number;
  pensionEmployerAmount: number;
  taxAmount: number;
  totalDeductions: number;
  netPay: number;
  status: "calculated";
  warnings: string[];
};

export type PayrollRunCalculation = {
  ruleVersion: string;
  calculationVersion: string;
  snapshotVersion: string;
  statutorySetupStatus: "setup_required" | "configured" | "not_applicable";
  country: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  employeeCount: number;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  employerContributionTotal: number;
  items: PayrollRunItemCalculation[];
  warnings: string[];
  disclaimer: string;
};

export function redactPayrollIdentifier(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length <= 4) {
    return "****";
  }

  return `****${trimmed.slice(-4)}`;
}

export function maskBankAccount(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return redactPayrollIdentifier(value);
  }

  return digits.length <= 4 ? "****" : `****${digits.slice(-4)}`;
}

export function payrollDisclaimer(statutorySetupStatus: string) {
  const statutory =
    statutorySetupStatus === "configured"
      ? "Verified statutory rules are applied from configured rule sources."
      : "Statutory payroll calculations are setup required and no PAYE, pension, or statutory rates have been fabricated.";

  return `Payroll calculations use recorded salary and custom component inputs only. ${statutory} Review before approval.`;
}

export function toPlainNumber(value: number | Prisma.Decimal | null | undefined) {
  if (value instanceof Prisma.Decimal) {
    return value.toNumber();
  }

  return Number.isFinite(Number(value)) ? Number(value) : 0;
}
