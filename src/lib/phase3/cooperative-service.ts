import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { summarizeCooperativeLedger, type CooperativeLedgerSummary } from "@/lib/phase3/cooperative-ledger";

export type CooperativeDashboardGroup = {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  status: string;
  contributionCycle: string;
  loanApprovalMode: string;
  dividendRule: string;
  memberCount: number;
  activeLoanCount: number;
  createdAt: string;
  summary: CooperativeLedgerSummary;
};

export async function listCooperativeDashboard({
  businessId,
  asOf = new Date(),
}: {
  businessId: string;
  asOf?: Date;
}): Promise<CooperativeDashboardGroup[]> {
  const groups = await getPrisma().cooperativeGroup.findMany({
    where: {
      businessId,
      archivedAt: null,
    },
    orderBy: { createdAt: "desc" },
    include: {
      members: true,
      contributionPlans: true,
      contributions: {
        orderBy: { paidAt: "desc" },
        take: 500,
      },
      loans: {
        orderBy: { requestedAt: "desc" },
        take: 200,
        include: {
          repayments: true,
        },
      },
      expenses: {
        orderBy: { spentAt: "desc" },
        take: 200,
      },
      distributions: {
        orderBy: { calculatedAt: "desc" },
        take: 200,
      },
      ledgerEntries: {
        orderBy: { entryDate: "desc" },
        take: 1000,
      },
    },
  });

  return groups.map((group) => {
    const repayments = group.loans.flatMap((loan) => loan.repayments);

    return {
      id: group.id,
      name: group.name,
      description: group.description,
      currency: group.currency,
      status: group.status,
      contributionCycle: group.contributionCycle,
      loanApprovalMode: group.loanApprovalMode,
      dividendRule: group.dividendRule,
      memberCount: group.members.filter((member) => member.status === "ACTIVE").length,
      activeLoanCount: group.loans.filter((loan) => !["SETTLED", "CANCELLED", "REJECTED"].includes(loan.status)).length,
      createdAt: group.createdAt.toISOString(),
      summary: summarizeCooperativeLedger({
        asOf,
        members: group.members.map((member) => ({
          id: member.id,
          displayName: member.displayName,
          status: member.status,
        })),
        contributionPlans: group.contributionPlans.map((plan) => ({
          id: plan.id,
          amount: plan.amount.toNumber(),
          frequency: plan.frequency,
          startDate: plan.startDate,
          graceDays: plan.graceDays,
          penaltyAmount: plan.penaltyAmount.toNumber(),
          status: plan.status,
        })),
        contributions: group.contributions.map((contribution) => ({
          memberId: contribution.memberId,
          planId: contribution.planId,
          amount: contribution.amount.toNumber(),
          penaltyAmount: contribution.penaltyAmount.toNumber(),
          dueDate: contribution.dueDate,
          paidAt: contribution.paidAt,
          status: contribution.status,
        })),
        loans: group.loans.map((loan) => ({
          id: loan.id,
          memberId: loan.memberId,
          principal: loan.principal.toNumber(),
          interestAmount: loan.interestAmount.toNumber(),
          penaltyAmount: loan.penaltyAmount.toNumber(),
          totalDue: loan.totalDue.toNumber(),
          disbursedAmount: loan.disbursedAmount.toNumber(),
          dueAt: loan.dueAt,
          status: loan.status,
        })),
        repayments: repayments.map((repayment) => ({
          loanId: repayment.loanId,
          memberId: repayment.memberId,
          amount: repayment.amount.toNumber(),
          principalPortion: repayment.principalPortion.toNumber(),
          interestPortion: repayment.interestPortion.toNumber(),
          penaltyPortion: repayment.penaltyPortion.toNumber(),
          paidAt: repayment.paidAt,
        })),
        expenses: group.expenses.map((expense) => ({
          amount: expense.amount.toNumber(),
          spentAt: expense.spentAt,
        })),
        distributions: group.distributions.map((distribution) => ({
          memberId: distribution.memberId,
          amount: distribution.amount.toNumber(),
          status: distribution.status,
        })),
        ledgerEntries: group.ledgerEntries.map((entry) => ({
          id: entry.id,
          memberId: entry.memberId,
          entryType: entry.entryType,
          debit: entry.debit.toNumber(),
          credit: entry.credit.toNumber(),
          entryDate: entry.entryDate,
        })),
      }),
    };
  });
}

export async function createCooperativeGroup({
  businessId,
  locationId,
  name,
  description,
  contributionAmount,
  contributionFrequency = "MONTHLY",
  actorId,
}: {
  businessId: string;
  locationId?: string;
  name: string;
  description?: string;
  contributionAmount?: number;
  contributionFrequency?: string;
  actorId?: string;
}) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const group = await tx.cooperativeGroup.create({
      data: {
        businessId,
        locationId,
        name,
        description,
        createdById: actorId,
      },
    });

    if (contributionAmount && contributionAmount > 0) {
      await tx.cooperativeContributionPlan.create({
        data: {
          businessId,
          groupId: group.id,
          name: "Member contribution",
          amount: contributionAmount,
          frequency: contributionFrequency,
        },
      });
    }

    return group;
  });
}

export async function addCooperativeMember({
  businessId,
  groupId,
  displayName,
  phone,
  email,
  externalReference,
}: {
  businessId: string;
  groupId: string;
  displayName: string;
  phone?: string;
  email?: string;
  externalReference?: string;
}) {
  await assertGroupBelongsToBusiness(groupId, businessId);

  return getPrisma().cooperativeMember.create({
    data: {
      businessId,
      groupId,
      displayName,
      phone,
      email,
      externalReference,
    },
  });
}

export async function recordCooperativeContribution({
  businessId,
  groupId,
  memberId,
  planId,
  amount,
  penaltyAmount = 0,
  dueDate,
  paidAt = new Date(),
  reference,
  actorId,
}: {
  businessId: string;
  groupId: string;
  memberId: string;
  planId?: string;
  amount: number;
  penaltyAmount?: number;
  dueDate?: Date;
  paidAt?: Date;
  reference?: string;
  actorId?: string;
}) {
  if (amount + penaltyAmount <= 0) {
    throw new Error("Contribution amount must be greater than zero.");
  }

  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    await assertMemberBelongsToGroup(tx, { businessId, groupId, memberId });

    if (planId) {
      await assertPlanBelongsToGroup(tx, { businessId, groupId, planId });
    }

    const contribution = await tx.cooperativeContribution.create({
      data: {
        businessId,
        groupId,
        memberId,
        planId,
        amount,
        penaltyAmount,
        dueDate,
        paidAt,
        reference,
        recordedById: actorId,
      },
    });

    await tx.cooperativeLedgerEntry.create({
      data: {
        businessId,
        groupId,
        memberId,
        contributionId: contribution.id,
        entryDate: paidAt,
        entryType: "CONTRIBUTION",
        credit: amount + penaltyAmount,
        debit: 0,
        memo: "Member contribution recorded.",
        reference,
        createdById: actorId,
      },
    });

    return contribution;
  });
}

export async function requestCooperativeLoan({
  businessId,
  groupId,
  memberId,
  principal,
  interestAmount = 0,
  penaltyAmount = 0,
  dueAt,
  guarantorMemberIds = [],
  actorId,
}: {
  businessId: string;
  groupId: string;
  memberId: string;
  principal: number;
  interestAmount?: number;
  penaltyAmount?: number;
  dueAt?: Date;
  guarantorMemberIds?: string[];
  actorId?: string;
}) {
  if (principal <= 0) {
    throw new Error("Loan principal must be greater than zero.");
  }

  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    await assertMemberBelongsToGroup(tx, { businessId, groupId, memberId });

    for (const guarantorMemberId of guarantorMemberIds) {
      await assertMemberBelongsToGroup(tx, { businessId, groupId, memberId: guarantorMemberId });
    }

    const loan = await tx.cooperativeLoan.create({
      data: {
        businessId,
        groupId,
        memberId,
        principal,
        interestAmount,
        penaltyAmount,
        totalDue: principal + interestAmount + penaltyAmount,
        dueAt,
        metadata: actorId ? { requestedById: actorId } : undefined,
        guarantors: {
          create: guarantorMemberIds.map((guarantorMemberId) => ({
            businessId,
            groupId,
            memberId: guarantorMemberId,
          })),
        },
      },
    });

    return loan;
  });
}

export async function recordCooperativeLoanRepayment({
  businessId,
  groupId,
  loanId,
  amount,
  principalPortion,
  interestPortion = 0,
  penaltyPortion = 0,
  paidAt = new Date(),
  reference,
  actorId,
}: {
  businessId: string;
  groupId: string;
  loanId: string;
  amount: number;
  principalPortion?: number;
  interestPortion?: number;
  penaltyPortion?: number;
  paidAt?: Date;
  reference?: string;
  actorId?: string;
}) {
  if (amount <= 0) {
    throw new Error("Repayment amount must be greater than zero.");
  }

  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const loan = await tx.cooperativeLoan.findFirst({
      where: {
        id: loanId,
        businessId,
        groupId,
      },
      select: {
        memberId: true,
      },
    });

    if (!loan) {
      throw new Error("Choose a valid cooperative loan.");
    }

    const repayment = await tx.cooperativeLoanRepayment.create({
      data: {
        businessId,
        groupId,
        loanId,
        memberId: loan.memberId,
        amount,
        principalPortion: principalPortion ?? amount - interestPortion - penaltyPortion,
        interestPortion,
        penaltyPortion,
        paidAt,
        reference,
        recordedById: actorId,
      },
    });

    await tx.cooperativeLedgerEntry.create({
      data: {
        businessId,
        groupId,
        memberId: loan.memberId,
        repaymentId: repayment.id,
        entryDate: paidAt,
        entryType: "LOAN_REPAYMENT",
        credit: amount,
        debit: 0,
        memo: "Loan repayment recorded.",
        reference,
        createdById: actorId,
      },
    });

    return repayment;
  });
}

async function assertGroupBelongsToBusiness(groupId: string, businessId: string) {
  const group = await getPrisma().cooperativeGroup.findFirst({
    where: {
      id: groupId,
      businessId,
      archivedAt: null,
    },
    select: { id: true },
  });

  if (!group) {
    throw new Error("Choose a valid cooperative group.");
  }
}

async function assertMemberBelongsToGroup(
  tx: Prisma.TransactionClient,
  {
    businessId,
    groupId,
    memberId,
  }: {
    businessId: string;
    groupId: string;
    memberId: string;
  },
) {
  const member = await tx.cooperativeMember.findFirst({
    where: {
      id: memberId,
      businessId,
      groupId,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  if (!member) {
    throw new Error("Choose a valid cooperative member.");
  }
}

async function assertPlanBelongsToGroup(
  tx: Prisma.TransactionClient,
  {
    businessId,
    groupId,
    planId,
  }: {
    businessId: string;
    groupId: string;
    planId: string;
  },
) {
  const plan = await tx.cooperativeContributionPlan.findFirst({
    where: {
      id: planId,
      businessId,
      groupId,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  if (!plan) {
    throw new Error("Choose a valid contribution plan.");
  }
}
