import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  assertPayrollRunCanBeRecalculated,
  buildPayrollSourceInputs,
  calculatePayrollRun,
  payrollRuleVersion,
  redactPayrollIdentifier,
  type PayrollMoneyLine,
} from "@/lib/phase3/payroll";

export type PayrollDashboard = {
  employees: Array<{
    id: string;
    displayName: string;
    roleTitle: string | null;
    baseSalary: number;
    payFrequency: string;
    country: string;
    status: string;
    pensionNumber: string | null;
    taxId: string | null;
  }>;
  runs: Array<{
    id: string;
    periodStart: string;
    periodEnd: string;
    payDate: string;
    ruleVersion: string;
    status: string;
    employeeCount: number;
    grossPay: number;
    totalDeductions: number;
    netPay: number;
    lockedAt: string | null;
    warnings: unknown;
  }>;
};

export type PayrollAdjustmentInput = {
  employeeId: string;
  allowances?: PayrollMoneyLine[];
  bonuses?: PayrollMoneyLine[];
  deductions?: PayrollMoneyLine[];
  loansAndAdvances?: PayrollMoneyLine[];
  pensionEmployeeAmount?: number;
  pensionEmployerAmount?: number;
  taxAmount?: number;
};

export async function listPayrollDashboard({
  businessId,
  locationId,
}: {
  businessId: string;
  locationId?: string;
}): Promise<PayrollDashboard> {
  const [employees, runs] = await Promise.all([
    getPrisma().payrollEmployee.findMany({
      where: {
        businessId,
        ...(locationId ? { locationId } : {}),
      },
      orderBy: [{ status: "asc" }, { displayName: "asc" }],
      take: 200,
    }),
    getPrisma().payrollRun.findMany({
      where: {
        businessId,
        ...(locationId ? { locationId } : {}),
      },
      orderBy: { periodStart: "desc" },
      take: 24,
    }),
  ]);

  return {
    employees: employees.map((employee) => ({
      id: employee.id,
      displayName: employee.displayName,
      roleTitle: employee.roleTitle,
      baseSalary: employee.baseSalary.toNumber(),
      payFrequency: employee.payFrequency,
      country: employee.country,
      status: employee.status,
      pensionNumber: redactPayrollIdentifier(employee.pensionNumber),
      taxId: redactPayrollIdentifier(employee.taxId),
    })),
    runs: runs.map((run) => ({
      id: run.id,
      periodStart: run.periodStart.toISOString(),
      periodEnd: run.periodEnd.toISOString(),
      payDate: run.payDate.toISOString(),
      ruleVersion: run.ruleVersion,
      status: run.status,
      employeeCount: run.employeeCount,
      grossPay: run.grossPay.toNumber(),
      totalDeductions: run.totalDeductions.toNumber(),
      netPay: run.netPay.toNumber(),
      lockedAt: run.lockedAt?.toISOString() ?? null,
      warnings: run.warnings,
    })),
  };
}

export async function createPayrollEmployee({
  businessId,
  locationId,
  displayName,
  roleTitle,
  baseSalary,
  payFrequency = "MONTHLY",
  country = "NG",
  currency = "NGN",
  employeeCode,
  email,
  phone,
  pensionNumber,
  taxId,
}: {
  businessId: string;
  locationId?: string;
  displayName: string;
  roleTitle?: string;
  baseSalary: number;
  payFrequency?: string;
  country?: string;
  currency?: string;
  employeeCode?: string;
  email?: string;
  phone?: string;
  pensionNumber?: string;
  taxId?: string;
}) {
  return getPrisma().payrollEmployee.create({
    data: {
      businessId,
      locationId,
      displayName,
      roleTitle,
      baseSalary,
      payFrequency,
      country,
      currency,
      employeeCode,
      email,
      phone,
      pensionNumber,
      taxId,
    },
  });
}

export async function draftPayrollRun({
  businessId,
  locationId,
  periodStart,
  periodEnd,
  payDate,
  country = "NG",
  adjustments = [],
  actorId,
}: {
  businessId: string;
  locationId?: string;
  periodStart: Date;
  periodEnd: Date;
  payDate: Date;
  country?: string;
  adjustments?: PayrollAdjustmentInput[];
  actorId?: string;
}) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const existingRun = await tx.payrollRun.findFirst({
      where: {
        businessId,
        locationId: locationId ?? null,
        periodStart,
        periodEnd,
        status: { not: "REVERSED" },
      },
      select: {
        id: true,
        status: true,
        lockedAt: true,
      },
    });

    if (existingRun) {
      assertPayrollRunCanBeRecalculated(existingRun);
      throw new Error("A draft payroll run already exists for this period.");
    }

    const employees = await tx.payrollEmployee.findMany({
      where: {
        businessId,
        ...(locationId ? { OR: [{ locationId }, { locationId: null }] } : {}),
        status: "ACTIVE",
      },
      orderBy: { displayName: "asc" },
    });
    const adjustmentByEmployee = new Map(adjustments.map((adjustment) => [adjustment.employeeId, adjustment]));
    const calculation = calculatePayrollRun({
      periodStart,
      periodEnd,
      payDate,
      country,
      employees: employees.map((employee) => {
        const adjustment = adjustmentByEmployee.get(employee.id);

        return {
          employeeId: employee.id,
          displayName: employee.displayName,
          baseSalary: employee.baseSalary.toNumber(),
          payFrequency: employee.payFrequency,
          country: employee.country,
          allowances: adjustment?.allowances,
          bonuses: adjustment?.bonuses,
          deductions: adjustment?.deductions,
          loansAndAdvances: adjustment?.loansAndAdvances,
          pensionEmployeeAmount: adjustment?.pensionEmployeeAmount,
          pensionEmployerAmount: adjustment?.pensionEmployerAmount,
          taxAmount: adjustment?.taxAmount,
        };
      }),
    });

    if (calculation.employeeCount === 0) {
      throw new Error("Add active employees before drafting payroll.");
    }

    return tx.payrollRun.create({
      data: {
        businessId,
        locationId,
        periodStart,
        periodEnd,
        payDate,
        country: calculation.country,
        ruleVersion: payrollRuleVersion,
        grossPay: calculation.grossPay,
        totalDeductions: calculation.totalDeductions,
        netPay: calculation.netPay,
        employeeCount: calculation.employeeCount,
        sourceInputs: toJson(buildPayrollSourceInputs(calculation)),
        warnings: toJson(calculation.warnings),
        createdById: actorId,
        items: {
          create: calculation.items.map((item) => ({
            businessId,
            employeeId: item.employeeId,
            basePay: item.basePay,
            allowances: toJson(item.allowances),
            bonuses: toJson(item.bonuses),
            deductions: toJson(item.deductions),
            loansAndAdvances: toJson(item.loansAndAdvances),
            grossPay: item.grossPay,
            pensionEmployeeAmount: item.pensionEmployeeAmount,
            pensionEmployerAmount: item.pensionEmployerAmount,
            taxAmount: item.taxAmount,
            netPay: item.netPay,
          })),
        },
      },
      include: { items: true },
    });
  });
}

export async function approvePayrollRun({
  businessId,
  runId,
  actorId,
}: {
  businessId: string;
  runId: string;
  actorId?: string;
}) {
  const run = await getPayrollRunForAction({ businessId, runId });

  if (run.status !== "DRAFT") {
    throw new Error("Only draft payroll runs can be approved.");
  }

  return getPrisma().payrollRun.update({
    where: { id: runId },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      approvedById: actorId,
    },
  });
}

export async function lockPayrollRun({
  businessId,
  runId,
  actorId,
}: {
  businessId: string;
  runId: string;
  actorId?: string;
}) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const run = await tx.payrollRun.findFirst({
      where: { id: runId, businessId },
      include: { items: true },
    });

    if (!run) {
      throw new Error("Choose a valid payroll run.");
    }

    if (run.status !== "APPROVED") {
      throw new Error("Approve payroll before locking it.");
    }

    if (run.lockedAt) {
      throw new Error("Payroll run is already locked.");
    }

    const lockedAt = new Date();
    const locked = await tx.payrollRun.update({
      where: { id: run.id },
      data: {
        status: "LOCKED",
        lockedAt,
        items: {
          updateMany: {
            where: { runId: run.id },
            data: { lockedAt },
          },
        },
      },
    });

    await tx.payrollJournalEntry.create({
      data: {
        businessId,
        runId: run.id,
        entryType: "PAYROLL_EXPENSE",
        amount: run.grossPay,
        status: "PENDING",
        createdById: actorId,
      },
    });

    return locked;
  });
}

export async function reversePayrollRun({
  businessId,
  runId,
  reason,
}: {
  businessId: string;
  runId: string;
  reason: string;
}) {
  const run = await getPayrollRunForAction({ businessId, runId });

  if (!["APPROVED", "LOCKED"].includes(run.status)) {
    throw new Error("Only approved or locked payroll runs can be reversed.");
  }

  return getPrisma().payrollRun.update({
    where: { id: runId },
    data: {
      status: "REVERSED",
      reversedAt: new Date(),
      reversalReason: reason,
    },
  });
}

async function getPayrollRunForAction({ businessId, runId }: { businessId: string; runId: string }) {
  const run = await getPrisma().payrollRun.findFirst({
    where: { id: runId, businessId },
    select: { id: true, status: true, lockedAt: true },
  });

  if (!run) {
    throw new Error("Choose a valid payroll run.");
  }

  return run;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
