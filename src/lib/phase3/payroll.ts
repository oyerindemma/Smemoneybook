export const payrollRuleVersion = "payroll-ng-foundation-v1";

export type PayrollMoneyLine = {
  label: string;
  amount: number;
};

export type PayrollEmployeeInput = {
  employeeId: string;
  displayName: string;
  baseSalary: number;
  payFrequency?: string;
  country?: string;
  allowances?: PayrollMoneyLine[];
  bonuses?: PayrollMoneyLine[];
  deductions?: PayrollMoneyLine[];
  loansAndAdvances?: PayrollMoneyLine[];
  pensionEmployeeAmount?: number;
  pensionEmployerAmount?: number;
  taxAmount?: number;
};

export type PayrollRunItemCalculation = {
  employeeId: string;
  displayName: string;
  basePay: number;
  allowances: PayrollMoneyLine[];
  bonuses: PayrollMoneyLine[];
  deductions: PayrollMoneyLine[];
  loansAndAdvances: PayrollMoneyLine[];
  grossPay: number;
  pensionEmployeeAmount: number;
  pensionEmployerAmount: number;
  taxAmount: number;
  totalDeductions: number;
  netPay: number;
  warnings: string[];
};

export type PayrollRunCalculation = {
  ruleVersion: string;
  country: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  employeeCount: number;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  employerPensionTotal: number;
  items: PayrollRunItemCalculation[];
  warnings: string[];
  disclaimer: string;
};

export function calculatePayrollRun({
  employees,
  periodStart,
  periodEnd,
  payDate,
  country = "NG",
  ruleVersion = payrollRuleVersion,
}: {
  employees: PayrollEmployeeInput[];
  periodStart: Date;
  periodEnd: Date;
  payDate: Date;
  country?: string;
  ruleVersion?: string;
}): PayrollRunCalculation {
  if (periodEnd <= periodStart) {
    throw new Error("Payroll period end must be after the start date.");
  }

  const activeEmployees = employees.filter((employee) => safeMoney(employee.baseSalary) >= 0);
  const items = activeEmployees.map(calculatePayrollItem);
  const warnings: string[] = [];

  if (employees.length === 0) {
    warnings.push("No active employees were found for this payroll run.");
  }

  if (country.toUpperCase() !== "NG") {
    warnings.push("Country-specific payroll rules for this country are not configured in this foundation.");
  }

  warnings.push(...items.flatMap((item) => item.warnings));

  return {
    ruleVersion,
    country: country.toUpperCase(),
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    payDate: payDate.toISOString(),
    employeeCount: items.length,
    grossPay: sumMoney(items.map((item) => item.grossPay)),
    totalDeductions: sumMoney(items.map((item) => item.totalDeductions)),
    netPay: sumMoney(items.map((item) => item.netPay)),
    employerPensionTotal: sumMoney(items.map((item) => item.pensionEmployerAmount)),
    items,
    warnings: Array.from(new Set(warnings)),
    disclaimer:
      "Payroll calculations are based on recorded inputs and configured amounts. They are not tax, pension, or legal advice.",
  };
}

export function calculatePayrollItem(employee: PayrollEmployeeInput): PayrollRunItemCalculation {
  const allowances = sanitizeLines(employee.allowances);
  const bonuses = sanitizeLines(employee.bonuses);
  const deductions = sanitizeLines(employee.deductions);
  const loansAndAdvances = sanitizeLines(employee.loansAndAdvances);
  const basePay = safeMoney(employee.baseSalary);
  const pensionEmployeeAmount = safeMoney(employee.pensionEmployeeAmount ?? 0);
  const pensionEmployerAmount = safeMoney(employee.pensionEmployerAmount ?? 0);
  const taxAmount = safeMoney(employee.taxAmount ?? 0);
  const grossPay = sumMoney([basePay, ...allowances.map((line) => line.amount), ...bonuses.map((line) => line.amount)]);
  const totalDeductions = sumMoney([
    ...deductions.map((line) => line.amount),
    ...loansAndAdvances.map((line) => line.amount),
    pensionEmployeeAmount,
    taxAmount,
  ]);
  const calculatedNetPay = roundMoney(grossPay - totalDeductions);
  const warnings: string[] = [];

  if (calculatedNetPay < 0) {
    warnings.push(`${employee.displayName} has deductions higher than gross pay.`);
  }

  return {
    employeeId: employee.employeeId,
    displayName: employee.displayName,
    basePay,
    allowances,
    bonuses,
    deductions,
    loansAndAdvances,
    grossPay,
    pensionEmployeeAmount,
    pensionEmployerAmount,
    taxAmount,
    totalDeductions,
    netPay: Math.max(0, calculatedNetPay),
    warnings,
  };
}

export function assertPayrollRunCanBeRecalculated({
  status,
  lockedAt,
}: {
  status: string;
  lockedAt?: Date | string | null;
}) {
  const normalized = status.toUpperCase();

  if (lockedAt || ["APPROVED", "LOCKED", "REVERSED", "PAID"].includes(normalized)) {
    throw new Error("Completed payroll runs cannot be recalculated. Reverse the run and create a new one.");
  }
}

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

export function buildPayrollSourceInputs(calculation: PayrollRunCalculation) {
  return {
    ruleVersion: calculation.ruleVersion,
    country: calculation.country,
    periodStart: calculation.periodStart,
    periodEnd: calculation.periodEnd,
    payDate: calculation.payDate,
    employeeIds: calculation.items.map((item) => item.employeeId),
    disclaimer: calculation.disclaimer,
  };
}

function sanitizeLines(lines: PayrollMoneyLine[] = []) {
  return lines
    .filter((line) => line.label.trim() && safeMoney(line.amount) > 0)
    .map((line) => ({
      label: line.label.trim(),
      amount: safeMoney(line.amount),
    }));
}

function safeMoney(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function sumMoney(values: number[]) {
  return roundMoney(values.reduce((total, value) => total + safeMoney(value), 0));
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
