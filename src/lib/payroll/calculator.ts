import { Prisma } from "@prisma/client";
import {
  payrollCalculationVersion,
  payrollDisclaimer,
  payrollRuleVersion,
  payrollSnapshotVersion,
  toPlainNumber,
  type PayrollEmployeeCalculationInput,
  type PayrollMoneyLine,
  type PayrollRunCalculation,
  type PayrollRunItemCalculation,
} from "@/lib/payroll/definitions";
import { getPayrollStatutorySetup, type PayrollStatutorySetup } from "@/lib/payroll/statutory-rules";

type CalculatePayrollRunInput = {
  employees: PayrollEmployeeCalculationInput[];
  periodStart: Date;
  periodEnd: Date;
  payDate: Date;
  country?: string;
  statutorySetup?: PayrollStatutorySetup;
};

export function calculatePayrollRun({
  employees,
  periodStart,
  periodEnd,
  payDate,
  country = "NG",
  statutorySetup = getPayrollStatutorySetup(country),
}: CalculatePayrollRunInput): PayrollRunCalculation {
  if (periodEnd <= periodStart) {
    throw new Error("Payroll period end must be after the start date.");
  }

  const items = employees.map((employee) => calculatePayrollItem(employee, statutorySetup));
  const warnings = new Set<string>();

  if (items.length === 0) {
    warnings.add("No active payroll employees were found for this period.");
  }

  if (statutorySetup.status === "setup_required") {
    warnings.add(statutorySetup.message);
  }

  for (const item of items) {
    item.warnings.forEach((warning) => warnings.add(warning));
  }

  return {
    ruleVersion: payrollRuleVersion,
    calculationVersion: payrollCalculationVersion,
    snapshotVersion: payrollSnapshotVersion,
    statutorySetupStatus: statutorySetup.status,
    country: country.toUpperCase(),
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    payDate: payDate.toISOString(),
    employeeCount: items.length,
    grossPay: moneyNumber(sum(items.map((item) => item.grossPay))),
    totalDeductions: moneyNumber(sum(items.map((item) => item.totalDeductions))),
    netPay: moneyNumber(sum(items.map((item) => item.netPay))),
    employerContributionTotal: moneyNumber(sum(items.map((item) => item.pensionEmployerAmount))),
    items,
    warnings: Array.from(warnings),
    disclaimer: payrollDisclaimer(statutorySetup.status),
  };
}

export function calculatePayrollItem(
  employee: PayrollEmployeeCalculationInput,
  statutorySetup: PayrollStatutorySetup = getPayrollStatutorySetup("NG"),
): PayrollRunItemCalculation {
  const warnings: string[] = [];
  const basePay = dec(employee.baseSalary);
  const allowances = sanitizeLines(employee.allowances, statutorySetup, warnings);
  const bonuses = sanitizeLines(employee.bonuses, statutorySetup, warnings);
  const deductions = sanitizeLines(employee.deductions, statutorySetup, warnings);
  const loansAndAdvances = sanitizeLines(employee.loansAndAdvances, statutorySetup, warnings);
  const pensionEmployeeAmount = statutoryAmount(
    "Employee pension",
    employee.pensionEmployeeAmount,
    statutorySetup,
    warnings,
  );
  const pensionEmployerAmount = statutoryAmount(
    "Employer pension",
    employee.pensionEmployerAmount,
    statutorySetup,
    warnings,
  );
  const taxAmount = statutoryAmount("PAYE", employee.taxAmount, statutorySetup, warnings);
  const grossPay = sum([
    basePay,
    ...allowances.map((line) => dec(line.amount)),
    ...bonuses.map((line) => dec(line.amount)),
  ]);
  const taxablePay = sum([
    basePay,
    ...allowances.filter((line) => line.taxable).map((line) => dec(line.amount)),
    ...bonuses.filter((line) => line.taxable !== false).map((line) => dec(line.amount)),
  ]);
  const totalDeductions = sum([
    ...deductions.map((line) => dec(line.amount)),
    ...loansAndAdvances.map((line) => dec(line.amount)),
    pensionEmployeeAmount,
    taxAmount,
  ]);
  const netBeforeFloor = grossPay.minus(totalDeductions);

  if (netBeforeFloor.lt(0)) {
    warnings.push(`${employee.displayName} has deductions higher than gross pay.`);
  }

  return {
    employeeId: employee.employeeId,
    employeeNumber: employee.employeeNumber,
    displayName: employee.displayName,
    roleTitle: employee.roleTitle,
    basePay: moneyNumber(basePay),
    allowances,
    bonuses,
    deductions,
    loansAndAdvances,
    componentSnapshot: [...allowances, ...bonuses, ...deductions, ...loansAndAdvances],
    grossPay: moneyNumber(grossPay),
    taxablePay: moneyNumber(taxablePay),
    pensionEmployeeAmount: moneyNumber(pensionEmployeeAmount),
    pensionEmployerAmount: moneyNumber(pensionEmployerAmount),
    taxAmount: moneyNumber(taxAmount),
    totalDeductions: moneyNumber(totalDeductions),
    netPay: moneyNumber(Prisma.Decimal.max(netBeforeFloor, 0)),
    status: "calculated",
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

  if (lockedAt || ["APPROVED", "EXPENSE_POSTED", "LOCKED", "REVERSED"].includes(normalized)) {
    throw new Error("Approved payroll periods cannot be recalculated. Reverse the period and create a new one.");
  }
}

export function buildPayrollSourceInputs(calculation: PayrollRunCalculation) {
  return {
    ruleVersion: calculation.ruleVersion,
    calculationVersion: calculation.calculationVersion,
    statutorySetupStatus: calculation.statutorySetupStatus,
    snapshotVersion: calculation.snapshotVersion,
    country: calculation.country,
    periodStart: calculation.periodStart,
    periodEnd: calculation.periodEnd,
    payDate: calculation.payDate,
    employeeIds: calculation.items.map((item) => item.employeeId),
    disclaimer: calculation.disclaimer,
  };
}

function sanitizeLines(
  lines: PayrollMoneyLine[] = [],
  statutorySetup: PayrollStatutorySetup,
  warnings: string[],
) {
  return lines
    .map((line) => ({
      label: line.label.trim(),
      amount: calculateLineAmount(line),
      type: line.type,
      taxable: Boolean(line.taxable),
      pensionable: Boolean(line.pensionable),
      statutory: Boolean(line.statutory),
      calculationMethod: line.calculationMethod,
    }))
    .filter((line) => {
      if (!line.label) {
        return false;
      }

      if (line.statutory && statutorySetup.status !== "configured") {
        warnings.push(`${line.label} is statutory and was not calculated because verified statutory setup is required.`);
        return false;
      }

      return line.amount.gt(0);
    })
    .map((line) => ({
      ...line,
      amount: moneyNumber(line.amount),
    }));
}

function calculateLineAmount(line: PayrollMoneyLine) {
  return dec(line.amount);
}

function statutoryAmount(
  label: string,
  value: number | Prisma.Decimal | undefined,
  statutorySetup: PayrollStatutorySetup,
  warnings: string[],
) {
  if (toPlainNumber(value) <= 0) {
    return new Prisma.Decimal(0);
  }

  if (statutorySetup.status !== "configured") {
    warnings.push(`${label} is setup required and was not calculated.`);
    return new Prisma.Decimal(0);
  }

  return dec(value);
}

function sum(values: Array<number | Prisma.Decimal>): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>(
    (total, value) => total.plus(dec(value)),
    new Prisma.Decimal(0),
  );
}

function dec(value: number | Prisma.Decimal | null | undefined) {
  if (value instanceof Prisma.Decimal) {
    return value;
  }

  return new Prisma.Decimal(Number.isFinite(Number(value)) ? Number(value) : 0);
}

function moneyNumber(value: Prisma.Decimal) {
  return value.toDecimalPlaces(2).toNumber();
}
