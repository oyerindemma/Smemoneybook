import { Prisma } from "@prisma/client";
import { recordCooperativeApprovalAction } from "@/lib/cooperatives/approvals";
import { CooperativesDomainError } from "@/lib/cooperatives/api";
import { assertMemberBelongsToGroup } from "@/lib/cooperatives/contributions";
import { assertGroupBelongsToBusiness, postCooperativeLedgerBatch } from "@/lib/cooperatives/ledger";
import { getPrisma } from "@/lib/prisma";

export type CooperativeLoanTerms = {
  principal: number;
  interestRate: number;
  interestMethod: "zero" | "flat";
  interestAmount: number;
  penaltyAmount: number;
  totalDue: number;
  termCount: number;
  repaymentFrequency: string;
  schedule: Array<{
    instalmentNumber: number;
    principalDue: number;
    interestDue: number;
    penaltyDue: number;
    totalDue: number;
  }>;
};

export function calculateCooperativeLoanTerms({
  principal,
  interestRate = 0,
  interestMethod = "zero",
  penaltyAmount = 0,
  termCount = 1,
  repaymentFrequency = "MONTHLY",
}: {
  principal: number;
  interestRate?: number;
  interestMethod?: string;
  penaltyAmount?: number;
  termCount?: number;
  repaymentFrequency?: string;
}): CooperativeLoanTerms {
  if (principal <= 0) {
    throw new CooperativesDomainError("Loan principal must be greater than zero.");
  }

  if (termCount < 1 || !Number.isInteger(termCount)) {
    throw new CooperativesDomainError("Loan term count must be at least one whole period.");
  }

  const method = interestMethod.toLowerCase();

  if (method === "reducing_balance") {
    throw new CooperativesDomainError("Reducing balance cooperative loan interest is not enabled until formula validation is complete.");
  }

  if (method !== "zero" && method !== "flat") {
    throw new CooperativesDomainError("Choose a supported cooperative loan interest method.");
  }

  const interestAmount = method === "flat" ? roundMoney(principal * (interestRate / 100)) : 0;
  const totalDue = roundMoney(principal + interestAmount + penaltyAmount);
  const principalPerTerm = roundMoney(principal / termCount);
  const interestPerTerm = roundMoney(interestAmount / termCount);
  const penaltyPerTerm = roundMoney(penaltyAmount / termCount);

  const schedule = Array.from({ length: termCount }, (_, index) => {
    const isLast = index === termCount - 1;
    const allocatedPrincipal = isLast
      ? roundMoney(principal - principalPerTerm * (termCount - 1))
      : principalPerTerm;
    const allocatedInterest = isLast
      ? roundMoney(interestAmount - interestPerTerm * (termCount - 1))
      : interestPerTerm;
    const allocatedPenalty = isLast
      ? roundMoney(penaltyAmount - penaltyPerTerm * (termCount - 1))
      : penaltyPerTerm;

    return {
      instalmentNumber: index + 1,
      principalDue: allocatedPrincipal,
      interestDue: allocatedInterest,
      penaltyDue: allocatedPenalty,
      totalDue: roundMoney(allocatedPrincipal + allocatedInterest + allocatedPenalty),
    };
  });

  return {
    principal,
    interestRate,
    interestMethod: method,
    interestAmount,
    penaltyAmount,
    totalDue,
    termCount,
    repaymentFrequency,
    schedule,
  };
}

export async function requestCooperativeLoan({
  businessId,
  groupId,
  memberId,
  principal,
  interestRate = 0,
  interestMethod = "zero",
  penaltyAmount = 0,
  termCount = 1,
  repaymentFrequency = "MONTHLY",
  purpose,
  dueAt,
  guarantorMemberIds = [],
  idempotencyKey,
  actorId,
}: {
  businessId: string;
  groupId: string;
  memberId: string;
  principal: number;
  interestRate?: number;
  interestMethod?: string;
  penaltyAmount?: number;
  termCount?: number;
  repaymentFrequency?: string;
  purpose?: string;
  dueAt?: Date;
  guarantorMemberIds?: string[];
  idempotencyKey?: string;
  actorId?: string;
}) {
  const terms = calculateCooperativeLoanTerms({
    principal,
    interestRate,
    interestMethod,
    penaltyAmount,
    termCount,
    repaymentFrequency,
  });
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    await assertMemberBelongsToGroup(tx, { businessId, groupId, memberId });

    for (const guarantorMemberId of guarantorMemberIds) {
      await assertMemberBelongsToGroup(tx, { businessId, groupId, memberId: guarantorMemberId });
    }

    if (idempotencyKey) {
      const existing = await tx.cooperativeLoan.findUnique({
        where: {
          businessId_idempotencyKey: {
            businessId,
            idempotencyKey,
          },
        },
      });

      if (existing) {
        return existing;
      }
    }

    const loan = await tx.cooperativeLoan.create({
      data: {
        businessId,
        groupId,
        memberId,
        principal,
        interestRate,
        interestMethod: terms.interestMethod,
        interestAmount: terms.interestAmount,
        penaltyAmount,
        totalDue: terms.totalDue,
        termCount,
        repaymentFrequency,
        purpose,
        dueAt,
        idempotencyKey,
        status: "draft",
        metadata: actorId
          ? ({
              requestedById: actorId,
            } as Prisma.InputJsonObject)
          : undefined,
        guarantors: {
          create: guarantorMemberIds.map((guarantorMemberId) => ({
            businessId,
            groupId,
            memberId: guarantorMemberId,
            guaranteeAmount: terms.totalDue,
          })),
        },
      },
    });

    await recordCooperativeApprovalAction({
      tx,
      businessId,
      groupId,
      targetType: "loan",
      targetId: loan.id,
      action: "drafted",
      actorId,
      metadata: { principal, interestMethod: terms.interestMethod, termCount },
    });

    return loan;
  });
}

export async function submitCooperativeLoanForReview({
  businessId,
  groupId,
  loanId,
  actorId,
}: {
  businessId: string;
  groupId: string;
  loanId: string;
  actorId?: string;
}) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const loan = await tx.cooperativeLoan.findFirst({
      where: { id: loanId, businessId, groupId },
      include: { group: true, guarantors: true },
    });

    if (!loan) {
      throw new CooperativesDomainError("Choose a valid cooperative loan.");
    }

    if (!["draft", "requested", "submitted", "guarantor_pending"].includes(loan.status.toLowerCase())) {
      throw new CooperativesDomainError("Only draft cooperative loans can be submitted.");
    }

    const confirmedGuarantors = loan.guarantors.filter((guarantor) =>
      ["CONFIRMED", "APPROVED"].includes(guarantor.status.toUpperCase()),
    ).length;
    const needsGuarantors = loan.group.requireGuarantors && confirmedGuarantors < loan.group.minimumGuarantors;
    const status = needsGuarantors ? "guarantor_pending" : "committee_review";

    const updated = await tx.cooperativeLoan.update({
      where: { id: loan.id },
      data: {
        status,
        submittedAt: new Date(),
        metadata: mergeMetadata(loan.metadata, { submittedById: actorId }),
      },
    });

    await recordCooperativeApprovalAction({
      tx,
      businessId,
      groupId,
      targetType: "loan",
      targetId: loan.id,
      action: "submitted",
      actorId,
      metadata: { status },
    });

    return updated;
  });
}

export async function confirmLoanGuarantor({
  businessId,
  groupId,
  loanId,
  guarantorMemberId,
  actorId,
}: {
  businessId: string;
  groupId: string;
  loanId: string;
  guarantorMemberId: string;
  actorId?: string;
}) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const guarantor = await tx.cooperativeLoanGuarantor.findFirst({
      where: {
        businessId,
        groupId,
        loanId,
        memberId: guarantorMemberId,
      },
    });

    if (!guarantor) {
      throw new CooperativesDomainError("Choose a valid cooperative guarantor.");
    }

    const updated = await tx.cooperativeLoanGuarantor.update({
      where: { id: guarantor.id },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
        approvedAt: new Date(),
      },
    });

    await recordCooperativeApprovalAction({
      tx,
      businessId,
      groupId,
      targetType: "loan",
      targetId: loanId,
      action: "guarantor_confirmed",
      actorId,
      metadata: { guarantorMemberId },
    });

    return updated;
  });
}

export async function approveCooperativeLoan({
  businessId,
  groupId,
  loanId,
  approvedAmount,
  actorId,
}: {
  businessId: string;
  groupId: string;
  loanId: string;
  approvedAmount?: number;
  actorId?: string;
}) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const loan = await tx.cooperativeLoan.findFirst({
      where: { id: loanId, businessId, groupId },
      include: { group: true, guarantors: true },
    });

    if (!loan) {
      throw new CooperativesDomainError("Choose a valid cooperative loan.");
    }

    const requestedById = metadataString(loan.metadata, "requestedById");

    if (actorId && requestedById === actorId) {
      throw new CooperativesDomainError("Loan approval requires a different approver.", 403, "approval_separation_required");
    }

    const confirmedGuarantors = loan.guarantors.filter((guarantor) =>
      ["CONFIRMED", "APPROVED"].includes(guarantor.status.toUpperCase()),
    ).length;

    if (loan.group.requireGuarantors && confirmedGuarantors < loan.group.minimumGuarantors) {
      throw new CooperativesDomainError("Required guarantors have not confirmed this cooperative loan.");
    }

    const nextPrincipal = approvedAmount ?? loan.principal.toNumber();
    const terms = calculateCooperativeLoanTerms({
      principal: nextPrincipal,
      interestRate: loan.interestRate.toNumber(),
      interestMethod: loan.interestMethod,
      penaltyAmount: loan.penaltyAmount.toNumber(),
      termCount: loan.termCount,
      repaymentFrequency: loan.repaymentFrequency,
    });
    const approvedAt = new Date();
    const updated = await tx.cooperativeLoan.update({
      where: { id: loan.id },
      data: {
        approvedAmount: nextPrincipal,
        principal: nextPrincipal,
        interestAmount: terms.interestAmount,
        totalDue: terms.totalDue,
        status: "approved",
        reviewedAt: approvedAt,
        reviewedByUserId: actorId,
        approvedAt,
        approvedById: actorId,
        metadata: mergeMetadata(loan.metadata, {
          approvedById: actorId,
          approvalFormulaVersion: "cooperative-loan-terms-v1",
        }),
      },
    });

    await recordCooperativeApprovalAction({
      tx,
      businessId,
      groupId,
      targetType: "loan",
      targetId: loan.id,
      action: "approved",
      actorId,
      metadata: { approvedAmount: nextPrincipal, totalDue: terms.totalDue },
    });

    return updated;
  });
}

export async function rejectCooperativeLoan({
  businessId,
  groupId,
  loanId,
  reason,
  actorId,
}: {
  businessId: string;
  groupId: string;
  loanId: string;
  reason: string;
  actorId?: string;
}) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const loan = await tx.cooperativeLoan.findFirst({
      where: { id: loanId, businessId, groupId },
    });

    if (!loan) {
      throw new CooperativesDomainError("Choose a valid cooperative loan.");
    }

    const updated = await tx.cooperativeLoan.update({
      where: { id: loan.id },
      data: {
        status: "rejected",
        reviewedAt: new Date(),
        reviewedByUserId: actorId,
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
    });

    await recordCooperativeApprovalAction({
      tx,
      businessId,
      groupId,
      targetType: "loan",
      targetId: loan.id,
      action: "rejected",
      actorId,
      reason,
    });

    return updated;
  });
}

export async function recordCooperativeLoanDisbursement({
  businessId,
  groupId,
  loanId,
  amount,
  disbursedAt = new Date(),
  reference,
  actorId,
}: {
  businessId: string;
  groupId: string;
  loanId: string;
  amount?: number;
  disbursedAt?: Date;
  reference?: string;
  actorId?: string;
}) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const loan = await tx.cooperativeLoan.findFirst({
      where: { id: loanId, businessId, groupId },
      include: { repaymentSchedules: true },
    });

    if (!loan) {
      throw new CooperativesDomainError("Choose a valid cooperative loan.");
    }

    if (loan.status.toLowerCase() !== "approved") {
      throw new CooperativesDomainError("Only approved cooperative loans can be marked as disbursed.");
    }

    const approvedAmount = loan.approvedAmount?.toNumber() ?? loan.principal.toNumber();
    const disbursementAmount = amount ?? approvedAmount;

    if (disbursementAmount <= 0 || disbursementAmount > approvedAmount) {
      throw new CooperativesDomainError("Disbursement amount must be within the approved cooperative loan amount.");
    }

    const terms = calculateCooperativeLoanTerms({
      principal: approvedAmount,
      interestRate: loan.interestRate.toNumber(),
      interestMethod: loan.interestMethod,
      penaltyAmount: loan.penaltyAmount.toNumber(),
      termCount: loan.termCount,
      repaymentFrequency: loan.repaymentFrequency,
    });

    if (loan.repaymentSchedules.length === 0) {
      await tx.cooperativeRepaymentSchedule.createMany({
        data: terms.schedule.map((line) => ({
          businessId,
          groupId,
          loanId: loan.id,
          instalmentNumber: line.instalmentNumber,
          dueDate: dueDateForInstalment(disbursedAt, line.instalmentNumber, loan.repaymentFrequency),
          principalDue: line.principalDue,
          interestDue: line.interestDue,
          penaltyDue: line.penaltyDue,
          totalDue: line.totalDue,
          status: "PENDING",
        })),
      });
    }

    await postCooperativeLedgerBatch({
      tx,
      businessId,
      groupId,
      eventType: "LOAN_DISBURSEMENT",
      sourceType: "cooperative_loan",
      sourceId: loan.id,
      idempotencyKey: reference ? `loan_disbursement:${reference}` : `loan_disbursement:${loan.id}`,
      memo: "Cooperative loan disbursement recorded.",
      postedByUserId: actorId,
      entryDate: disbursedAt,
      entries: [
        {
          accountCode: "LOANS_RECEIVABLE",
          debit: disbursementAmount,
          memberId: loan.memberId,
          loanId: loan.id,
          reference,
        },
        {
          accountCode: "CASH_CONTROL",
          credit: disbursementAmount,
          memberId: loan.memberId,
          loanId: loan.id,
          reference,
        },
      ],
    });

    const updated = await tx.cooperativeLoan.update({
      where: { id: loan.id },
      data: {
        disbursedAmount: disbursementAmount,
        disbursedAt,
        disbursementReference: reference,
        disbursedRecordedByUserId: actorId,
        status: "active",
      },
    });

    await recordCooperativeApprovalAction({
      tx,
      businessId,
      groupId,
      targetType: "loan",
      targetId: loan.id,
      action: "disbursement_recorded",
      actorId,
      metadata: { amount: disbursementAmount },
    });

    return updated;
  });
}

export async function getCooperativeLoan({
  businessId,
  groupId,
  loanId,
}: {
  businessId: string;
  groupId: string;
  loanId: string;
}) {
  const loan = await getPrisma().cooperativeLoan.findFirst({
    where: { id: loanId, businessId, groupId },
    include: {
      member: true,
      guarantors: { include: { member: true } },
      repaymentSchedules: { orderBy: [{ dueDate: "asc" }, { instalmentNumber: "asc" }] },
      repayments: { orderBy: { paidAt: "asc" } },
    },
  });

  if (!loan) {
    throw new CooperativesDomainError("Choose a valid cooperative loan.");
  }

  return loan;
}

export async function assertLoanBelongsToGroup(
  tx: Prisma.TransactionClient,
  {
    businessId,
    groupId,
    loanId,
  }: {
    businessId: string;
    groupId: string;
    loanId: string;
  },
) {
  await assertGroupBelongsToBusiness(tx, { businessId, groupId });

  const loan = await tx.cooperativeLoan.findFirst({
    where: { id: loanId, businessId, groupId },
    select: { id: true, memberId: true, status: true },
  });

  if (!loan) {
    throw new CooperativesDomainError("Choose a valid cooperative loan.");
  }

  return loan;
}

function dueDateForInstalment(start: Date, instalmentNumber: number, frequency: string) {
  const dueDate = new Date(start);
  const frequencyKey = frequency.toLowerCase();

  if (frequencyKey === "weekly") {
    dueDate.setUTCDate(dueDate.getUTCDate() + 7 * instalmentNumber);
    return dueDate;
  }

  if (frequencyKey === "quarterly") {
    dueDate.setUTCMonth(dueDate.getUTCMonth() + 3 * instalmentNumber);
    return dueDate;
  }

  if (frequencyKey === "annual" || frequencyKey === "yearly") {
    dueDate.setUTCFullYear(dueDate.getUTCFullYear() + instalmentNumber);
    return dueDate;
  }

  dueDate.setUTCMonth(dueDate.getUTCMonth() + instalmentNumber);
  return dueDate;
}

function mergeMetadata(metadata: Prisma.JsonValue, next: Record<string, unknown>) {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return {
      ...metadata,
      ...next,
    } as Prisma.InputJsonObject;
  }

  return next as Prisma.InputJsonObject;
}

function metadataString(metadata: Prisma.JsonValue, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  const value = metadata[key as keyof typeof metadata];
  return typeof value === "string" ? value : undefined;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
