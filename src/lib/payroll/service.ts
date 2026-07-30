import { Prisma, PaymentStatus, TransactionType } from "@prisma/client";
import {
  assertCanApprovePayroll,
  assertCanPostPayrollExpense,
  assertCanRejectPayroll,
  assertCanReversePayroll,
  assertCanSubmitPayroll,
} from "@/lib/payroll/approval";
import { PayrollDomainError } from "@/lib/payroll/api";
import {
  assertPayrollRunCanBeRecalculated,
  buildPayrollSourceInputs,
  calculatePayrollRun,
} from "@/lib/payroll/calculator";
import {
  maskBankAccount,
  payrollCalculationVersion,
  payrollRuleVersion,
  payrollSnapshotVersion,
  redactPayrollIdentifier,
  toPlainNumber,
  type PayrollComponentType,
  type PayrollMoneyLine,
} from "@/lib/payroll/definitions";
import { buildPayslipSnapshot } from "@/lib/payroll/payslip";
import { getPayrollStatutorySetup } from "@/lib/payroll/statutory-rules";
import { getPrisma } from "@/lib/prisma";

export type PayrollComponentInput = {
  name: string;
  type: PayrollComponentType;
  calculationMethod?: "fixed_amount" | "percentage_of_base" | "manual";
  amount?: number;
  rate?: number;
  taxable?: boolean;
  pensionable?: boolean;
  statutory?: boolean;
};

export type PayrollDashboard = {
  setup: ReturnType<typeof getPayrollSetup>;
  employees: PayrollEmployeeSummary[];
  periods: PayrollPeriodSummary[];
  runs: PayrollPeriodSummary[];
  componentDefinitions: Array<{
    id: string;
    name: string;
    type: string;
    calculationMethod: string;
    taxable: boolean;
    pensionable: boolean;
    statutory: boolean;
    active: boolean;
  }>;
};

export type PayrollEmployeeSummary = {
  id: string;
  employeeNumber: string | null;
  displayName: string;
  fullName: string | null;
  roleTitle: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  baseSalary: number;
  payFrequency: string;
  country: string;
  currency: string;
  status: string;
  employmentStatus: string;
  startDate: string | null;
  endDate: string | null;
  paymentMethod: string;
  maskedBankAccount: string | null;
  pensionNumber: string | null;
  taxId: string | null;
  components: PayrollMoneyLine[];
};

export type PayrollPeriodSummary = {
  id: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  ruleVersion: string;
  calculationVersion: string;
  snapshotVersion: string;
  statutorySetupStatus: string;
  status: string;
  employeeCount: number;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  preparedByUserId: string | null;
  submittedForReviewAt: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  approvedById: string | null;
  approvedAt: string | null;
  expenseTransactionId: string | null;
  expensePostedAt: string | null;
  lockedAt: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
  requiresDualApproval: boolean;
  warnings: unknown;
  items?: PayrollRunItemSummary[];
  approvalActions?: Array<{
    id: string;
    action: string;
    reason: string | null;
    performedByUserId: string;
    createdAt: string;
  }>;
  payslipCount?: number;
};

export type PayrollRunItemSummary = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string | null;
  jobTitle: string | null;
  basePay: number;
  allowances: unknown;
  bonuses: unknown;
  deductions: unknown;
  loansAndAdvances: unknown;
  componentSnapshot: unknown;
  grossPay: number;
  taxablePay: number;
  totalDeductions: number;
  pensionEmployeeAmount: number;
  pensionEmployerAmount: number;
  taxAmount: number;
  netPay: number;
  status: string;
  paymentStatus: string;
  payslipGenerated: boolean;
};

export function getPayrollSetup(country = "NG") {
  const statutory = getPayrollStatutorySetup(country);

  return {
    statutory,
    calculationVersion: payrollCalculationVersion,
    snapshotVersion: payrollSnapshotVersion,
    payments: {
      enabled: false,
      status: "disabled",
      message: "Payroll does not transfer money or connect to bank payroll systems in this Preview release.",
    },
    expensePosting: {
      enabled: true,
      status: "explicit_only",
      message: "Approved payroll can be posted as an accounting expense only through an explicit authorized action.",
    },
  };
}

export async function listPayrollDashboard({
  businessId,
  locationId,
  includeSensitive = false,
}: {
  businessId: string;
  locationId?: string;
  includeSensitive?: boolean;
}): Promise<PayrollDashboard> {
  const prisma = getPrisma();
  const [business, employees, periods, componentDefinitions] = await Promise.all([
    prisma.business.findUnique({
      where: { id: businessId },
      select: { country: true },
    }),
    prisma.payrollEmployee.findMany({
      where: {
        businessId,
        ...(locationId ? { locationId } : {}),
      },
      include: {
        compensations: { orderBy: { effectiveFrom: "desc" }, take: 1 },
        employeeComponents: {
          where: { effectiveTo: null },
          include: { componentDefinition: true },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ employmentStatus: "asc" }, { displayName: "asc" }],
      take: 200,
    }),
    prisma.payrollRun.findMany({
      where: {
        businessId,
        ...(locationId ? { locationId } : {}),
      },
      include: {
        items: { include: { employee: true, payslip: true }, orderBy: { createdAt: "asc" } },
        approvalActions: { orderBy: { createdAt: "desc" } },
        payslips: true,
      },
      orderBy: { periodStart: "desc" },
      take: 24,
    }),
    prisma.payrollComponentDefinition.findMany({
      where: { businessId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      take: 100,
    }),
  ]);
  const country = business?.country ?? "NG";
  const periodSummaries = periods.map((period) => serializePayrollPeriod(period));

  return {
    setup: getPayrollSetup(country),
    employees: employees.map((employee) => serializePayrollEmployee(employee, includeSensitive)),
    periods: periodSummaries,
    runs: periodSummaries,
    componentDefinitions: componentDefinitions.map((definition) => ({
      id: definition.id,
      name: definition.name,
      type: definition.type,
      calculationMethod: definition.calculationMethod,
      taxable: definition.taxable,
      pensionable: definition.pensionable,
      statutory: definition.statutory,
      active: definition.active,
    })),
  };
}

export async function createPayrollEmployee(input: {
  businessId: string;
  locationId?: string;
  userId?: string;
  staffMembershipId?: string;
  employeeNumber?: string;
  displayName: string;
  fullName?: string;
  roleTitle?: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  baseSalary: number;
  payFrequency?: string;
  country?: string;
  currency?: string;
  employeeCode?: string;
  paymentMethod?: string;
  bankAccount?: string;
  pensionNumber?: string;
  taxId?: string;
  startDate?: Date;
  components?: PayrollComponentInput[];
}) {
  const prisma = getPrisma();
  const startDate = input.startDate ?? new Date();
  const employeeNumber = input.employeeNumber || input.employeeCode || `PAY-${Date.now()}`;
  const maskedBankAccount = maskBankAccount(input.bankAccount);

  return prisma.$transaction(async (tx) => {
    const employee = await tx.payrollEmployee.create({
      data: {
        businessId: input.businessId,
        locationId: input.locationId,
        userId: input.userId,
        staffMembershipId: input.staffMembershipId,
        employeeCode: input.employeeCode ?? employeeNumber,
        employeeNumber,
        displayName: input.displayName,
        fullName: input.fullName ?? input.displayName,
        roleTitle: input.roleTitle,
        jobTitle: input.jobTitle ?? input.roleTitle,
        email: input.email,
        phone: input.phone,
        baseSalary: money(input.baseSalary),
        payFrequency: input.payFrequency ?? "MONTHLY",
        country: input.country ?? "NG",
        currency: input.currency ?? "NGN",
        pensionNumber: input.pensionNumber,
        taxId: input.taxId,
        paymentMethod: input.paymentMethod ?? "manual",
        maskedBankAccount,
        employmentStatus: "active",
        status: "ACTIVE",
        startDate,
        joinedAt: startDate,
        compensations: {
          create: {
            businessId: input.businessId,
            effectiveFrom: startDate,
            baseSalary: money(input.baseSalary),
            currency: input.currency ?? "NGN",
            payFrequency: input.payFrequency ?? "MONTHLY",
          },
        },
      },
      include: {
        compensations: { orderBy: { effectiveFrom: "desc" }, take: 1 },
        employeeComponents: { include: { componentDefinition: true } },
      },
    });

    if (input.components?.length) {
      await replaceEmployeeComponents(tx, {
        businessId: input.businessId,
        employeeId: employee.id,
        effectiveFrom: startDate,
        components: input.components,
      });
    }

    return tx.payrollEmployee.findUniqueOrThrow({
      where: { id: employee.id },
      include: {
        compensations: { orderBy: { effectiveFrom: "desc" }, take: 1 },
        employeeComponents: {
          where: { effectiveTo: null },
          include: { componentDefinition: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  });
}

export async function updatePayrollEmployee(input: {
  businessId: string;
  employeeId: string;
  displayName?: string;
  fullName?: string;
  roleTitle?: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  baseSalary?: number;
  payFrequency?: string;
  paymentMethod?: string;
  bankAccount?: string;
  employmentStatus?: "active" | "inactive" | "terminated" | "on_leave";
  endDate?: Date;
  effectiveFrom?: Date;
  components?: PayrollComponentInput[];
}) {
  const prisma = getPrisma();
  const effectiveFrom = input.effectiveFrom ?? new Date();

  return prisma.$transaction(async (tx) => {
    const employee = await tx.payrollEmployee.findFirst({
      where: { id: input.employeeId, businessId: input.businessId },
    });

    if (!employee) {
      throw new PayrollDomainError("Choose a valid payroll employee.", 404);
    }

    const nextSalary = input.baseSalary ?? employee.baseSalary.toNumber();
    const nextFrequency = input.payFrequency ?? employee.payFrequency;
    const nextStatus = input.employmentStatus ?? employee.employmentStatus;

    await tx.payrollEmployee.update({
      where: { id: employee.id },
      data: {
        displayName: input.displayName,
        fullName: input.fullName ?? input.displayName,
        roleTitle: input.roleTitle,
        jobTitle: input.jobTitle ?? input.roleTitle,
        email: input.email,
        phone: input.phone,
        baseSalary: input.baseSalary === undefined ? undefined : money(input.baseSalary),
        payFrequency: input.payFrequency,
        paymentMethod: input.paymentMethod,
        maskedBankAccount: input.bankAccount === undefined ? undefined : maskBankAccount(input.bankAccount),
        employmentStatus: input.employmentStatus,
        status: nextStatus.toUpperCase(),
        endDate: input.endDate,
        exitedAt: input.endDate,
      },
    });

    if (input.baseSalary !== undefined || input.payFrequency) {
      await tx.payrollCompensation.updateMany({
        where: {
          businessId: input.businessId,
          employeeId: employee.id,
          effectiveTo: null,
        },
        data: { effectiveTo: effectiveFrom },
      });
      await tx.payrollCompensation.create({
        data: {
          businessId: input.businessId,
          employeeId: employee.id,
          effectiveFrom,
          baseSalary: money(nextSalary),
          currency: employee.currency,
          payFrequency: nextFrequency,
        },
      });
    }

    if (input.components) {
      await replaceEmployeeComponents(tx, {
        businessId: input.businessId,
        employeeId: employee.id,
        effectiveFrom,
        components: input.components,
      });
    }

    return tx.payrollEmployee.findUniqueOrThrow({
      where: { id: employee.id },
      include: {
        compensations: { orderBy: { effectiveFrom: "desc" }, take: 1 },
        employeeComponents: {
          where: { effectiveTo: null },
          include: { componentDefinition: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  });
}

export async function createPayrollPeriod(input: {
  businessId: string;
  locationId?: string;
  periodStart: Date;
  periodEnd: Date;
  payDate: Date;
  country?: string;
  actorId: string;
  requiresDualApproval?: boolean;
}) {
  if (input.periodEnd <= input.periodStart) {
    throw new PayrollDomainError("Payroll period end must be after the start date.");
  }

  const setup = getPayrollStatutorySetup(input.country ?? "NG");

  return getPrisma().payrollRun.create({
    data: {
      businessId: input.businessId,
      locationId: input.locationId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      payDate: input.payDate,
      country: input.country ?? "NG",
      ruleVersion: payrollRuleVersion,
      sourceInputs: toJson({ prepared: true, snapshotVersion: payrollSnapshotVersion }),
      warnings: toJson([setup.message]),
      statutorySetupStatus: setup.status,
      snapshotVersion: payrollSnapshotVersion,
      requiresDualApproval: Boolean(input.requiresDualApproval),
      createdById: input.actorId,
      preparedByUserId: input.actorId,
    },
  });
}

export async function getPayrollPeriod({
  businessId,
  periodId,
}: {
  businessId: string;
  periodId: string;
}) {
  const period = await getPrisma().payrollRun.findFirst({
    where: { id: periodId, businessId },
    include: {
      items: { include: { employee: true, payslip: true }, orderBy: { createdAt: "asc" } },
      approvalActions: { orderBy: { createdAt: "desc" } },
      payslips: true,
    },
  });

  if (!period) {
    throw new PayrollDomainError("Choose a valid payroll period.", 404);
  }

  return serializePayrollPeriod(period);
}

export async function calculatePayrollPeriod({
  businessId,
  periodId,
  actorId,
}: {
  businessId: string;
  periodId: string;
  actorId: string;
}) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const period = await tx.payrollRun.findFirst({
      where: { id: periodId, businessId },
      select: {
        id: true,
        status: true,
        lockedAt: true,
        locationId: true,
        periodStart: true,
        periodEnd: true,
        payDate: true,
        country: true,
      },
    });

    if (!period) {
      throw new PayrollDomainError("Choose a valid payroll period.", 404);
    }

    try {
      assertPayrollRunCanBeRecalculated(period);
    } catch (error) {
      throw new PayrollDomainError(
        error instanceof Error ? error.message : "This payroll period cannot be recalculated.",
        409,
        "payroll_locked",
      );
    }

    if (period.status === "UNDER_REVIEW") {
      throw new PayrollDomainError("Return payroll to draft before recalculating.");
    }

    const employees = await tx.payrollEmployee.findMany({
      where: {
        businessId,
        status: "ACTIVE",
        employmentStatus: "active",
        ...(period.locationId ? { OR: [{ locationId: period.locationId }, { locationId: null }] } : {}),
      },
      include: {
        compensations: {
          where: {
            effectiveFrom: { lte: period.periodEnd },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: period.periodStart } }],
          },
          orderBy: { effectiveFrom: "desc" },
        },
        employeeComponents: {
          where: {
            effectiveFrom: { lte: period.periodEnd },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: period.periodStart } }],
          },
          include: { componentDefinition: true },
        },
      },
      orderBy: { displayName: "asc" },
    });

    if (employees.length === 0) {
      throw new PayrollDomainError("Add active employees before calculating payroll.");
    }

    const statutorySetup = getPayrollStatutorySetup(period.country);
    const calculation = calculatePayrollRun({
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      payDate: period.payDate,
      country: period.country,
      statutorySetup,
      employees: employees.map((employee) => {
        const compensation = selectEffectivePayrollCompensation(
          employee.compensations,
          period.periodStart,
          period.periodEnd,
        );
        const baseSalary = compensation?.baseSalary ?? employee.baseSalary;
        const componentLines = buildComponentLines(employee.employeeComponents, baseSalary);

        return {
          employeeId: employee.id,
          employeeNumber: employee.employeeNumber ?? employee.employeeCode,
          displayName: employee.displayName,
          roleTitle: employee.jobTitle ?? employee.roleTitle,
          baseSalary,
          currency: compensation?.currency ?? employee.currency,
          payFrequency: compensation?.payFrequency ?? employee.payFrequency,
          allowances: componentLines.allowances,
          deductions: componentLines.deductions,
        };
      }),
    });

    await tx.payrollRunItem.deleteMany({ where: { runId: period.id } });
    await tx.payrollRun.update({
      where: { id: period.id },
      data: {
        status: "CALCULATED",
        ruleVersion: calculation.ruleVersion,
        grossPay: calculation.grossPay,
        totalDeductions: calculation.totalDeductions,
        netPay: calculation.netPay,
        employeeCount: calculation.employeeCount,
        sourceInputs: toJson(buildPayrollSourceInputs(calculation)),
        warnings: toJson(calculation.warnings),
        statutorySetupStatus: calculation.statutorySetupStatus,
        snapshotVersion: calculation.snapshotVersion,
        preparedByUserId: actorId,
        items: {
          create: calculation.items.map((item) => ({
            businessId,
            employeeId: item.employeeId,
            basePay: item.basePay,
            allowances: toJson(item.allowances),
            bonuses: toJson(item.bonuses),
            deductions: toJson(item.deductions),
            loansAndAdvances: toJson(item.loansAndAdvances),
            componentSnapshot: toJson(item.componentSnapshot),
            calculationVersion: calculation.calculationVersion,
            grossPay: item.grossPay,
            taxablePay: item.taxablePay,
            totalDeductions: item.totalDeductions,
            pensionEmployeeAmount: item.pensionEmployeeAmount,
            pensionEmployerAmount: item.pensionEmployerAmount,
            taxAmount: item.taxAmount,
            netPay: item.netPay,
            status: item.status,
          })),
        },
      },
    });

    await tx.payrollApprovalAction.create({
      data: {
        businessId,
        periodId: period.id,
        action: "prepared",
        performedByUserId: actorId,
      },
    });

    return tx.payrollRun.findUniqueOrThrow({
      where: { id: period.id },
      include: {
        items: { include: { employee: true, payslip: true }, orderBy: { createdAt: "asc" } },
        approvalActions: { orderBy: { createdAt: "desc" } },
        payslips: true,
      },
    });
  });
}

export async function submitPayrollForReview({
  businessId,
  periodId,
  actorId,
}: {
  businessId: string;
  periodId: string;
  actorId: string;
}) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const period = await getPayrollRunForAction(tx, { businessId, periodId });
    assertCanSubmitPayroll(period.status);

    const updated = await tx.payrollRun.update({
      where: { id: period.id },
      data: {
        status: "UNDER_REVIEW",
        submittedForReviewAt: new Date(),
        reviewedByUserId: actorId,
        reviewedAt: new Date(),
      },
    });

    await tx.payrollApprovalAction.create({
      data: {
        businessId,
        periodId: period.id,
        action: "submitted_for_review",
        performedByUserId: actorId,
      },
    });

    return updated;
  });
}

export async function approvePayrollPeriod({
  businessId,
  periodId,
  actorId,
}: {
  businessId: string;
  periodId: string;
  actorId: string;
}) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const period = await getPayrollRunForAction(tx, { businessId, periodId });
    assertCanApprovePayroll({
      status: period.status,
      preparedByUserId: period.preparedByUserId ?? period.createdById,
      approverUserId: actorId,
      requiresDualApproval: period.requiresDualApproval,
    });

    const lockedAt = new Date();
    const updated = await tx.payrollRun.update({
      where: { id: period.id },
      data: {
        status: "APPROVED",
        approvedById: actorId,
        approvedAt: lockedAt,
        lockedAt,
        items: {
          updateMany: {
            where: { runId: period.id },
            data: { status: "approved", lockedAt },
          },
        },
      },
    });

    await tx.payrollApprovalAction.create({
      data: {
        businessId,
        periodId: period.id,
        action: "approved",
        performedByUserId: actorId,
      },
    });

    return updated;
  });
}

export async function rejectPayrollPeriod({
  businessId,
  periodId,
  actorId,
  reason,
}: {
  businessId: string;
  periodId: string;
  actorId: string;
  reason: string;
}) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const period = await getPayrollRunForAction(tx, { businessId, periodId });
    assertCanRejectPayroll(period.status);

    const updated = await tx.payrollRun.update({
      where: { id: period.id },
      data: {
        status: "CANCELLED",
        rejectedByUserId: actorId,
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
    });

    await tx.payrollApprovalAction.create({
      data: {
        businessId,
        periodId: period.id,
        action: "rejected",
        reason,
        performedByUserId: actorId,
      },
    });

    return updated;
  });
}

export async function postPayrollExpense({
  businessId,
  periodId,
  actorId,
}: {
  businessId: string;
  periodId: string;
  actorId: string;
}) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const period = await tx.payrollRun.findFirst({
      where: { id: periodId, businessId },
      include: { expenseTransaction: true },
    });

    if (!period) {
      throw new PayrollDomainError("Choose a valid payroll period.", 404);
    }

    if (period.expenseTransactionId && period.expenseTransaction) {
      return {
        period,
        transaction: period.expenseTransaction,
        alreadyPosted: true,
      };
    }

    const existing = await tx.transaction.findFirst({
      where: {
        businessId,
        idempotencyKey: payrollExpenseIdempotencyKey(period.id),
      },
    });

    if (existing) {
      const updated = await tx.payrollRun.update({
        where: { id: period.id },
        data: {
          status: "EXPENSE_POSTED",
          expenseTransactionId: existing.id,
          expensePostedAt: new Date(),
          expensePostedByUserId: actorId,
        },
      });

      return { period: updated, transaction: existing, alreadyPosted: true };
    }

    assertCanPostPayrollExpense(period.status);

    const account = await tx.account.findFirst({
      where: { businessId },
      orderBy: [{ type: "asc" }, { createdAt: "asc" }],
    });

    if (!account) {
      throw new PayrollDomainError("Create an account before posting payroll expense.");
    }

    const transaction = await tx.transaction.create({
      data: {
        businessId,
        accountId: account.id,
        idempotencyKey: payrollExpenseIdempotencyKey(period.id),
        duplicateFingerprint: payrollExpenseIdempotencyKey(period.id),
        type: TransactionType.EXPENSE,
        amount: period.grossPay,
        description: `Payroll expense for ${period.periodStart.toISOString().slice(0, 10)} to ${period.periodEnd.toISOString().slice(0, 10)}`,
        category: "Payroll",
        paymentStatus: PaymentStatus.UNPAID,
        occurredAt: period.payDate,
      },
    });

    const updated = await tx.payrollRun.update({
      where: { id: period.id },
      data: {
        status: "EXPENSE_POSTED",
        expenseTransactionId: transaction.id,
        expensePostedAt: new Date(),
        expensePostedByUserId: actorId,
        items: {
          updateMany: {
            where: { runId: period.id },
            data: { status: "expense_posted" },
          },
        },
      },
    });

    await tx.payrollJournalEntry.create({
      data: {
        businessId,
        runId: period.id,
        transactionId: transaction.id,
        entryType: "PAYROLL_EXPENSE",
        amount: period.grossPay,
        status: "POSTED",
        createdById: actorId,
      },
    });
    await tx.payrollApprovalAction.create({
      data: {
        businessId,
        periodId: period.id,
        action: "expense_posted",
        performedByUserId: actorId,
      },
    });

    return { period: updated, transaction, alreadyPosted: false };
  });
}

export async function reversePayrollPeriod({
  businessId,
  periodId,
  actorId,
  reason,
}: {
  businessId: string;
  periodId: string;
  actorId: string;
  reason: string;
}) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const period = await tx.payrollRun.findFirst({
      where: { id: periodId, businessId },
      include: { expenseTransaction: true },
    });

    if (!period) {
      throw new PayrollDomainError("Choose a valid payroll period.", 404);
    }

    assertCanReversePayroll(period.status);

    if (period.expenseTransaction) {
      const existingReversal = await tx.transaction.findFirst({
        where: {
          businessId,
          reversesTransactionId: period.expenseTransaction.id,
        },
      });
      const accountId = period.expenseTransaction.accountId;

      if (!existingReversal) {
        await tx.transaction.create({
          data: {
            businessId,
            accountId,
            idempotencyKey: payrollReversalIdempotencyKey(period.id),
            duplicateFingerprint: payrollReversalIdempotencyKey(period.id),
            type: TransactionType.ADJUSTMENT,
            amount: period.expenseTransaction.amount,
            description: `Payroll expense reversal: ${reason}`,
            category: "Payroll reversal",
            paymentStatus: PaymentStatus.UNPAID,
            occurredAt: new Date(),
            reversesTransactionId: period.expenseTransaction.id,
          },
        });
      }
    }

    const updated = await tx.payrollRun.update({
      where: { id: period.id },
      data: {
        status: "REVERSED",
        reversedAt: new Date(),
        reversalReason: reason,
        items: {
          updateMany: {
            where: { runId: period.id },
            data: { status: "reversed" },
          },
        },
      },
    });

    await tx.payrollApprovalAction.create({
      data: {
        businessId,
        periodId: period.id,
        action: "reversed",
        reason,
        performedByUserId: actorId,
      },
    });

    return updated;
  });
}

export async function generatePayrollPayslips({
  businessId,
  periodId,
  actorId,
}: {
  businessId: string;
  periodId: string;
  actorId: string;
}) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const period = await tx.payrollRun.findFirst({
      where: { id: periodId, businessId },
      include: {
        business: { select: { name: true, currency: true } },
        items: { include: { employee: true }, orderBy: { createdAt: "asc" } },
      },
    });

    if (!period) {
      throw new PayrollDomainError("Choose a valid payroll period.", 404);
    }

    if (!["APPROVED", "EXPENSE_POSTED", "LOCKED"].includes(period.status)) {
      throw new PayrollDomainError("Approve payroll before generating payslips.");
    }

    const payslips = [];

    for (const item of period.items) {
      const contentSnapshot = buildPayslipSnapshot({
        businessName: period.business.name,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        payDate: period.payDate,
        currency: period.business.currency,
        runItem: item,
      });
      const payslip = await tx.payrollPayslip.upsert({
        where: { runItemId: item.id },
        create: {
          businessId,
          runId: period.id,
          runItemId: item.id,
          contentSnapshot,
          generatedByUserId: actorId,
        },
        update: {
          contentSnapshot,
          generatedByUserId: actorId,
          generatedAt: new Date(),
        },
      });

      payslips.push(payslip);
    }

    await tx.payrollApprovalAction.create({
      data: {
        businessId,
        periodId: period.id,
        action: "reviewed",
        reason: "Payslips generated from approved snapshot.",
        performedByUserId: actorId,
      },
    });

    return payslips;
  });
}

export function serializePayrollEmployee(employee: {
  id: string;
  employeeNumber: string | null;
  employeeCode: string | null;
  displayName: string;
  fullName: string | null;
  roleTitle: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  baseSalary: Prisma.Decimal;
  payFrequency: string;
  country: string;
  currency: string;
  pensionNumber: string | null;
  taxId: string | null;
  paymentMethod: string;
  maskedBankAccount: string | null;
  status: string;
  employmentStatus: string;
  startDate: Date | null;
  endDate: Date | null;
  employeeComponents?: Array<{
    amount: Prisma.Decimal | null;
    rate: Prisma.Decimal | null;
    componentDefinition: {
      name: string;
      type: string;
      calculationMethod: string;
      taxable: boolean;
      pensionable: boolean;
      statutory: boolean;
    };
  }>;
}, includeSensitive = false): PayrollEmployeeSummary {
  return {
    id: employee.id,
    employeeNumber: employee.employeeNumber ?? employee.employeeCode,
    displayName: employee.displayName,
    fullName: employee.fullName,
    roleTitle: employee.roleTitle,
    jobTitle: employee.jobTitle,
    email: employee.email,
    phone: employee.phone,
    baseSalary: employee.baseSalary.toNumber(),
    payFrequency: employee.payFrequency,
    country: employee.country,
    currency: employee.currency,
    status: employee.status,
    employmentStatus: employee.employmentStatus,
    startDate: employee.startDate?.toISOString() ?? null,
    endDate: employee.endDate?.toISOString() ?? null,
    paymentMethod: employee.paymentMethod,
    maskedBankAccount: employee.maskedBankAccount,
    pensionNumber: includeSensitive ? redactPayrollIdentifier(employee.pensionNumber) : null,
    taxId: includeSensitive ? redactPayrollIdentifier(employee.taxId) : null,
    components: (employee.employeeComponents ?? []).map((component) => ({
      label: component.componentDefinition.name,
      amount: component.amount?.toNumber() ?? 0,
      type: component.componentDefinition.type as PayrollComponentType,
      taxable: component.componentDefinition.taxable,
      pensionable: component.componentDefinition.pensionable,
      statutory: component.componentDefinition.statutory,
      calculationMethod: component.componentDefinition.calculationMethod as PayrollComponentInput["calculationMethod"],
    })),
  };
}

export function serializePayrollPeriod(period: {
  id: string;
  periodStart: Date;
  periodEnd: Date;
  payDate: Date;
  ruleVersion: string;
  snapshotVersion: string;
  statutorySetupStatus: string;
  status: string;
  employeeCount: number;
  grossPay: Prisma.Decimal;
  totalDeductions: Prisma.Decimal;
  netPay: Prisma.Decimal;
  preparedByUserId: string | null;
  submittedForReviewAt: Date | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  approvedById: string | null;
  approvedAt: Date | null;
  expenseTransactionId: string | null;
  expensePostedAt: Date | null;
  lockedAt: Date | null;
  reversedAt: Date | null;
  reversalReason: string | null;
  requiresDualApproval: boolean;
  warnings: Prisma.JsonValue;
  items?: Array<{
    id: string;
    employeeId: string;
    basePay: Prisma.Decimal;
    allowances: Prisma.JsonValue;
    bonuses: Prisma.JsonValue;
    deductions: Prisma.JsonValue;
    loansAndAdvances: Prisma.JsonValue;
    componentSnapshot: Prisma.JsonValue | null;
    grossPay: Prisma.Decimal;
    taxablePay: Prisma.Decimal;
    totalDeductions: Prisma.Decimal;
    pensionEmployeeAmount: Prisma.Decimal;
    pensionEmployerAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    netPay: Prisma.Decimal;
    status: string;
    paymentStatus: string;
    employee: {
      displayName: string;
      employeeNumber: string | null;
      employeeCode: string | null;
      roleTitle: string | null;
      jobTitle: string | null;
    };
    payslip?: { id: string } | null;
  }>;
  approvalActions?: Array<{
    id: string;
    action: string;
    reason: string | null;
    performedByUserId: string;
    createdAt: Date;
  }>;
  payslips?: Array<{ id: string }>;
}): PayrollPeriodSummary {
  return {
    id: period.id,
    periodStart: period.periodStart.toISOString(),
    periodEnd: period.periodEnd.toISOString(),
    payDate: period.payDate.toISOString(),
    ruleVersion: period.ruleVersion,
    calculationVersion: payrollCalculationVersion,
    snapshotVersion: period.snapshotVersion,
    statutorySetupStatus: period.statutorySetupStatus,
    status: period.status,
    employeeCount: period.employeeCount,
    grossPay: period.grossPay.toNumber(),
    totalDeductions: period.totalDeductions.toNumber(),
    netPay: period.netPay.toNumber(),
    preparedByUserId: period.preparedByUserId,
    submittedForReviewAt: period.submittedForReviewAt?.toISOString() ?? null,
    reviewedByUserId: period.reviewedByUserId,
    reviewedAt: period.reviewedAt?.toISOString() ?? null,
    approvedById: period.approvedById,
    approvedAt: period.approvedAt?.toISOString() ?? null,
    expenseTransactionId: period.expenseTransactionId,
    expensePostedAt: period.expensePostedAt?.toISOString() ?? null,
    lockedAt: period.lockedAt?.toISOString() ?? null,
    reversedAt: period.reversedAt?.toISOString() ?? null,
    reversalReason: period.reversalReason,
    requiresDualApproval: period.requiresDualApproval,
    warnings: period.warnings,
    items: period.items?.map((item) => ({
      id: item.id,
      employeeId: item.employeeId,
      employeeName: item.employee.displayName,
      employeeNumber: item.employee.employeeNumber ?? item.employee.employeeCode,
      jobTitle: item.employee.jobTitle ?? item.employee.roleTitle,
      basePay: item.basePay.toNumber(),
      allowances: item.allowances,
      bonuses: item.bonuses,
      deductions: item.deductions,
      loansAndAdvances: item.loansAndAdvances,
      componentSnapshot: item.componentSnapshot,
      grossPay: item.grossPay.toNumber(),
      taxablePay: item.taxablePay.toNumber(),
      totalDeductions: item.totalDeductions.toNumber(),
      pensionEmployeeAmount: item.pensionEmployeeAmount.toNumber(),
      pensionEmployerAmount: item.pensionEmployerAmount.toNumber(),
      taxAmount: item.taxAmount.toNumber(),
      netPay: item.netPay.toNumber(),
      status: item.status,
      paymentStatus: item.paymentStatus,
      payslipGenerated: Boolean(item.payslip),
    })),
    approvalActions: period.approvalActions?.map((action) => ({
      id: action.id,
      action: action.action,
      reason: action.reason,
      performedByUserId: action.performedByUserId,
      createdAt: action.createdAt.toISOString(),
    })),
    payslipCount: period.payslips?.length ?? 0,
  };
}

type PayrollTx = Prisma.TransactionClient;

async function replaceEmployeeComponents(
  tx: PayrollTx,
  input: {
    businessId: string;
    employeeId: string;
    effectiveFrom: Date;
    components: PayrollComponentInput[];
  },
) {
  await tx.payrollEmployeeComponent.updateMany({
    where: {
      businessId: input.businessId,
      employeeId: input.employeeId,
      effectiveTo: null,
    },
    data: { effectiveTo: input.effectiveFrom },
  });

  for (const component of input.components) {
    const definition = await tx.payrollComponentDefinition.upsert({
      where: { businessId_name: { businessId: input.businessId, name: component.name.trim() } },
      create: {
        businessId: input.businessId,
        name: component.name.trim(),
        type: component.type,
        calculationMethod: component.calculationMethod ?? "fixed_amount",
        taxable: Boolean(component.taxable),
        pensionable: Boolean(component.pensionable),
        statutory: Boolean(component.statutory),
        formulaConfig: toJson({
          rate: component.rate ?? null,
          phase: "phase3i",
        }),
      },
      update: {
        type: component.type,
        calculationMethod: component.calculationMethod ?? "fixed_amount",
        taxable: Boolean(component.taxable),
        pensionable: Boolean(component.pensionable),
        statutory: Boolean(component.statutory),
        active: true,
        formulaConfig: toJson({
          rate: component.rate ?? null,
          phase: "phase3i",
        }),
      },
    });

    await tx.payrollEmployeeComponent.create({
      data: {
        businessId: input.businessId,
        employeeId: input.employeeId,
        componentDefinitionId: definition.id,
        amount: component.amount === undefined ? undefined : money(component.amount),
        rate: component.rate === undefined ? undefined : money(component.rate),
        effectiveFrom: input.effectiveFrom,
      },
    });
  }
}

function buildComponentLines(
  components: Array<{
    amount: Prisma.Decimal | null;
    rate: Prisma.Decimal | null;
    componentDefinition: {
      name: string;
      type: string;
      calculationMethod: string;
      taxable: boolean;
      pensionable: boolean;
      statutory: boolean;
    };
  }>,
  baseSalary: Prisma.Decimal,
) {
  const allowances: PayrollMoneyLine[] = [];
  const deductions: PayrollMoneyLine[] = [];

  for (const component of components) {
    const amount = calculateComponentAmount(component, baseSalary);
    const line: PayrollMoneyLine = {
      label: component.componentDefinition.name,
      amount,
      type: component.componentDefinition.type as PayrollComponentType,
      taxable: component.componentDefinition.taxable,
      pensionable: component.componentDefinition.pensionable,
      statutory: component.componentDefinition.statutory,
      calculationMethod: component.componentDefinition.calculationMethod as PayrollComponentInput["calculationMethod"],
    };

    if (component.componentDefinition.type === "deduction") {
      deductions.push(line);
      continue;
    }

    if (component.componentDefinition.type === "allowance") {
      allowances.push(line);
    }
  }

  return { allowances, deductions };
}

function calculateComponentAmount(
  component: {
    amount: Prisma.Decimal | null;
    rate: Prisma.Decimal | null;
    componentDefinition: { calculationMethod: string };
  },
  baseSalary: Prisma.Decimal,
) {
  if (component.componentDefinition.calculationMethod === "percentage_of_base") {
    return baseSalary.mul(component.rate ?? 0).div(100).toDecimalPlaces(2).toNumber();
  }

  return toPlainNumber(component.amount);
}

export function selectEffectivePayrollCompensation<
  T extends { effectiveFrom: Date; effectiveTo: Date | null },
>(compensations: T[], periodStart: Date, periodEnd: Date) {
  return [...compensations]
    .filter((compensation) => {
      return (
        compensation.effectiveFrom <= periodEnd &&
        (compensation.effectiveTo === null || compensation.effectiveTo > periodStart)
      );
    })
    .sort((left, right) => right.effectiveFrom.getTime() - left.effectiveFrom.getTime())[0];
}

async function getPayrollRunForAction(
  tx: PayrollTx,
  { businessId, periodId }: { businessId: string; periodId: string },
) {
  const period = await tx.payrollRun.findFirst({
    where: { id: periodId, businessId },
    select: {
      id: true,
      status: true,
      lockedAt: true,
      preparedByUserId: true,
      createdById: true,
      requiresDualApproval: true,
    },
  });

  if (!period) {
    throw new PayrollDomainError("Choose a valid payroll period.", 404);
  }

  return period;
}

function payrollExpenseIdempotencyKey(periodId: string) {
  return `phase3i-payroll-expense-${periodId}`;
}

function payrollReversalIdempotencyKey(periodId: string) {
  return `phase3i-payroll-reversal-${periodId}`;
}

function money(value: number | Prisma.Decimal) {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
