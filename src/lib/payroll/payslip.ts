import { Prisma } from "@prisma/client";
import { maskBankAccount, redactPayrollIdentifier } from "@/lib/payroll/definitions";

type PayslipInput = {
  businessName: string;
  periodStart: Date;
  periodEnd: Date;
  payDate: Date;
  currency: string;
  runItem: {
    id: string;
    grossPay: Prisma.Decimal;
    taxablePay: Prisma.Decimal;
    totalDeductions: Prisma.Decimal;
    netPay: Prisma.Decimal;
    pensionEmployeeAmount: Prisma.Decimal;
    pensionEmployerAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    allowances: Prisma.JsonValue;
    bonuses: Prisma.JsonValue;
    deductions: Prisma.JsonValue;
    loansAndAdvances: Prisma.JsonValue;
    componentSnapshot: Prisma.JsonValue | null;
    employee: {
      displayName: string;
      employeeNumber: string | null;
      employeeCode: string | null;
      roleTitle: string | null;
      jobTitle: string | null;
      paymentMethod: string;
      maskedBankAccount: string | null;
      pensionNumber: string | null;
      taxId: string | null;
    };
  };
};

export function buildPayslipSnapshot(input: PayslipInput): Prisma.InputJsonObject {
  const employee = input.runItem.employee;

  return {
    businessName: input.businessName,
    periodStart: input.periodStart.toISOString(),
    periodEnd: input.periodEnd.toISOString(),
    payDate: input.payDate.toISOString(),
    currency: input.currency,
    employee: {
      name: employee.displayName,
      employeeNumber: employee.employeeNumber ?? employee.employeeCode,
      jobTitle: employee.jobTitle ?? employee.roleTitle,
      paymentMethod: employee.paymentMethod,
      maskedBankAccount: maskBankAccount(employee.maskedBankAccount),
      pensionNumber: redactPayrollIdentifier(employee.pensionNumber),
      taxId: redactPayrollIdentifier(employee.taxId),
    },
    totals: {
      grossPay: input.runItem.grossPay.toNumber(),
      taxablePay: input.runItem.taxablePay.toNumber(),
      deductions: input.runItem.totalDeductions.toNumber(),
      netPay: input.runItem.netPay.toNumber(),
      pensionEmployeeAmount: input.runItem.pensionEmployeeAmount.toNumber(),
      pensionEmployerAmount: input.runItem.pensionEmployerAmount.toNumber(),
      taxAmount: input.runItem.taxAmount.toNumber(),
    },
    lines: {
      allowances: input.runItem.allowances,
      bonuses: input.runItem.bonuses,
      deductions: input.runItem.deductions,
      loansAndAdvances: input.runItem.loansAndAdvances,
      componentSnapshot: input.runItem.componentSnapshot,
    },
    note: "Payslip generated from an approved Payroll snapshot. It is not proof of bank payment.",
  };
}
