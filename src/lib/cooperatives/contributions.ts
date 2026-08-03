import { Prisma } from "@prisma/client";
import { CooperativesDomainError } from "@/lib/cooperatives/api";
import {
  assertGroupBelongsToBusiness,
  ensureCooperativeLedgerAccounts,
  postCooperativeLedgerBatch,
  summarizeCooperativeLedger,
  type CooperativeLedgerSummary,
} from "@/lib/cooperatives/ledger";
import { getPrisma } from "@/lib/prisma";

export type CooperativeDashboardGroup = {
  id: string;
  businessId: string;
  locationId: string | null;
  name: string;
  description: string | null;
  registrationReference: string | null;
  currency: string;
  status: string;
  contributionCycle: string;
  loanApprovalMode: string;
  dividendRule: string;
  fiscalYearStart: number;
  requireGuarantors: boolean;
  minimumGuarantors: number;
  memberCount: number;
  activeLoanCount: number;
  createdAt: string;
  members: Array<{
    id: string;
    memberNumber: string | null;
    displayName: string;
    fullName: string | null;
    phone: string | null;
    email: string | null;
    status: string;
    joinedAt: string;
    balance: number;
  }>;
  contributionPlans: Array<{
    id: string;
    name: string;
    amount: number;
    frequency: string;
    startDate: string;
    endDate: string | null;
    graceDays: number;
    penaltyAmount: number;
    mandatory: boolean;
    active: boolean;
    status: string;
  }>;
  contributions: Array<{
    id: string;
    memberId: string;
    planId: string | null;
    amount: number;
    penaltyAmount: number;
    paidAt: string;
    dueDate: string | null;
    status: string;
    reference: string | null;
  }>;
  loans: Array<{
    id: string;
    memberId: string;
    principal: number;
    approvedAmount: number | null;
    interestAmount: number;
    interestRate: number;
    interestMethod: string;
    termCount: number;
    repaymentFrequency: string;
    totalDue: number;
    disbursedAmount: number;
    status: string;
    purpose: string | null;
    requestedAt: string;
    approvedAt: string | null;
    disbursedAt: string | null;
    dueAt: string | null;
    outstandingAmount: number;
  }>;
  repaymentSchedules: Array<{
    id: string;
    loanId: string;
    instalmentNumber: number;
    dueDate: string;
    totalDue: number;
    paidAmount: number;
    status: string;
  }>;
  summary: CooperativeLedgerSummary;
};

export async function listCooperativeDashboard({
  businessId,
  asOf = new Date(),
  includeSensitive = false,
}: {
  businessId: string;
  asOf?: Date;
  includeSensitive?: boolean;
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
          repaymentSchedules: true,
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
      repaymentSchedules: {
        orderBy: [{ dueDate: "asc" }, { instalmentNumber: "asc" }],
        take: 300,
      },
    },
  });

  return groups.map((group) => {
    const repayments = group.loans.flatMap((loan) => loan.repayments);
    const summary = summarizeCooperativeLedger({
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
    });
    const balanceByMember = new Map(summary.memberBalances.map((member) => [member.memberId, member.balance]));
    const loanBalanceById = new Map(summary.loanBalances.map((loan) => [loan.loanId, loan.outstandingAmount]));

    return {
      id: group.id,
      businessId: group.businessId,
      locationId: group.locationId,
      name: group.name,
      description: group.description,
      registrationReference: group.registrationReference,
      currency: group.currency,
      status: group.status,
      contributionCycle: group.contributionCycle,
      loanApprovalMode: group.loanApprovalMode,
      dividendRule: group.dividendRule,
      fiscalYearStart: group.fiscalYearStart,
      requireGuarantors: group.requireGuarantors,
      minimumGuarantors: group.minimumGuarantors,
      memberCount: group.members.filter((member) => member.status === "ACTIVE").length,
      activeLoanCount: group.loans.filter((loan) => !["SETTLED", "COMPLETED", "CANCELLED", "REJECTED"].includes(loan.status.toUpperCase())).length,
      createdAt: group.createdAt.toISOString(),
      members: group.members.map((member) => ({
        id: member.id,
        memberNumber: member.memberNumber,
        displayName: member.displayName,
        fullName: includeSensitive ? member.fullName : null,
        phone: includeSensitive ? member.phone : maskText(member.phone),
        email: includeSensitive ? member.email : maskEmail(member.email),
        status: member.status,
        joinedAt: member.joinedAt.toISOString(),
        balance: balanceByMember.get(member.id) ?? 0,
      })),
      contributionPlans: group.contributionPlans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        amount: plan.amount.toNumber(),
        frequency: plan.frequency,
        startDate: plan.startDate.toISOString(),
        endDate: plan.endDate?.toISOString() ?? null,
        graceDays: plan.graceDays,
        penaltyAmount: plan.penaltyAmount.toNumber(),
        mandatory: plan.mandatory,
        active: plan.active,
        status: plan.status,
      })),
      contributions: group.contributions.map((contribution) => ({
        id: contribution.id,
        memberId: contribution.memberId,
        planId: contribution.planId,
        amount: contribution.amount.toNumber(),
        penaltyAmount: contribution.penaltyAmount.toNumber(),
        paidAt: contribution.paidAt.toISOString(),
        dueDate: contribution.dueDate?.toISOString() ?? null,
        status: contribution.status,
        reference: contribution.reference,
      })),
      loans: group.loans.map((loan) => ({
        id: loan.id,
        memberId: loan.memberId,
        principal: loan.principal.toNumber(),
        approvedAmount: loan.approvedAmount?.toNumber() ?? null,
        interestAmount: loan.interestAmount.toNumber(),
        interestRate: loan.interestRate.toNumber(),
        interestMethod: loan.interestMethod,
        termCount: loan.termCount,
        repaymentFrequency: loan.repaymentFrequency,
        totalDue: loan.totalDue.toNumber(),
        disbursedAmount: loan.disbursedAmount.toNumber(),
        status: loan.status,
        purpose: loan.purpose,
        requestedAt: loan.requestedAt.toISOString(),
        approvedAt: loan.approvedAt?.toISOString() ?? null,
        disbursedAt: loan.disbursedAt?.toISOString() ?? null,
        dueAt: loan.dueAt?.toISOString() ?? null,
        outstandingAmount: loanBalanceById.get(loan.id) ?? loan.totalDue.toNumber(),
      })),
      repaymentSchedules: group.repaymentSchedules.map((schedule) => ({
        id: schedule.id,
        loanId: schedule.loanId,
        instalmentNumber: schedule.instalmentNumber,
        dueDate: schedule.dueDate.toISOString(),
        totalDue: schedule.totalDue.toNumber(),
        paidAmount: schedule.paidAmount.toNumber(),
        status: schedule.status,
      })),
      summary,
    };
  });
}

export async function createCooperativeGroup({
  businessId,
  locationId,
  name,
  description,
  registrationReference,
  currency = "NGN",
  contributionAmount,
  contributionFrequency = "MONTHLY",
  requireGuarantors = false,
  minimumGuarantors = 0,
  actorId,
}: {
  businessId: string;
  locationId?: string;
  name: string;
  description?: string;
  registrationReference?: string;
  currency?: string;
  contributionAmount?: number;
  contributionFrequency?: string;
  requireGuarantors?: boolean;
  minimumGuarantors?: number;
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
        registrationReference,
        currency,
        requireGuarantors,
        minimumGuarantors: Math.max(0, minimumGuarantors),
        createdById: actorId,
      },
    });

    await ensureCooperativeLedgerAccounts({ tx, businessId, groupId: group.id });

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

export async function updateCooperativeGroup({
  businessId,
  groupId,
  name,
  description,
  registrationReference,
  requireGuarantors,
  minimumGuarantors,
}: {
  businessId: string;
  groupId: string;
  name?: string;
  description?: string | null;
  registrationReference?: string | null;
  requireGuarantors?: boolean;
  minimumGuarantors?: number;
}) {
  const prisma = getPrisma();
  const group = await prisma.cooperativeGroup.findFirst({
    where: { id: groupId, businessId, archivedAt: null },
    select: { id: true },
  });

  if (!group) {
    throw new CooperativesDomainError("Choose a valid cooperative group.");
  }

  return prisma.cooperativeGroup.update({
    where: { id: group.id },
    data: {
      name,
      description,
      registrationReference,
      requireGuarantors,
      minimumGuarantors,
    },
  });
}

export async function addCooperativeMember({
  businessId,
  groupId,
  memberNumber,
  displayName,
  fullName,
  phone,
  email,
  externalReference,
}: {
  businessId: string;
  groupId: string;
  memberNumber?: string;
  displayName: string;
  fullName?: string;
  phone?: string;
  email?: string;
  externalReference?: string;
}) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    await assertGroupBelongsToBusiness(tx, { businessId, groupId });

    return tx.cooperativeMember.create({
      data: {
        businessId,
        groupId,
        memberNumber,
        displayName,
        fullName,
        phone,
        email,
        externalReference,
      },
    });
  });
}

export async function createContributionPlan({
  businessId,
  groupId,
  name,
  amount,
  frequency,
  startDate = new Date(),
  endDate,
  graceDays = 0,
  penaltyAmount = 0,
  mandatory = true,
}: {
  businessId: string;
  groupId: string;
  name: string;
  amount: number;
  frequency: string;
  startDate?: Date;
  endDate?: Date;
  graceDays?: number;
  penaltyAmount?: number;
  mandatory?: boolean;
}) {
  if (amount <= 0) {
    throw new CooperativesDomainError("Contribution plan amount must be greater than zero.");
  }

  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    await assertGroupBelongsToBusiness(tx, { businessId, groupId });

    return tx.cooperativeContributionPlan.create({
      data: {
        businessId,
        groupId,
        name,
        amount,
        frequency,
        startDate,
        endDate,
        graceDays,
        penaltyAmount,
        mandatory,
        active: true,
        status: "ACTIVE",
      },
    });
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
  paymentReference,
  idempotencyKey,
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
  paymentReference?: string;
  idempotencyKey?: string;
  actorId?: string;
}) {
  if (amount + penaltyAmount <= 0) {
    throw new CooperativesDomainError("Contribution amount must be greater than zero.");
  }

  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    await assertMemberBelongsToGroup(tx, { businessId, groupId, memberId });

    if (planId) {
      await assertPlanBelongsToGroup(tx, { businessId, groupId, planId });
    }

    if (idempotencyKey) {
      const existing = await tx.cooperativeContribution.findUnique({
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
        paymentReference,
        idempotencyKey,
        recordedById: actorId,
      },
    });

    const totalCash = amount + penaltyAmount;
    await postCooperativeLedgerBatch({
      tx,
      businessId,
      groupId,
      eventType: "CONTRIBUTION",
      sourceType: "cooperative_contribution",
      sourceId: contribution.id,
      idempotencyKey: idempotencyKey ? `ledger:${idempotencyKey}` : undefined,
      memo: "Member contribution recorded.",
      postedByUserId: actorId,
      entryDate: paidAt,
      entries: [
        {
          accountCode: "CASH_CONTROL",
          debit: totalCash,
          memberId,
          contributionId: contribution.id,
          reference,
        },
        {
          accountCode: "MEMBER_SAVINGS",
          credit: amount,
          memberId,
          contributionId: contribution.id,
          reference,
        },
        ...(penaltyAmount > 0
          ? [
              {
                accountCode: "PENALTY_INCOME" as const,
                credit: penaltyAmount,
                memberId,
                contributionId: contribution.id,
                reference,
              },
            ]
          : []),
      ],
    });

    return contribution;
  });
}

export async function reverseCooperativeContribution({
  businessId,
  groupId,
  contributionId,
  reason,
  actorId,
}: {
  businessId: string;
  groupId: string;
  contributionId: string;
  reason: string;
  actorId?: string;
}) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const contribution = await tx.cooperativeContribution.findFirst({
      where: {
        id: contributionId,
        businessId,
        groupId,
        reversedAt: null,
      },
    });

    if (!contribution) {
      throw new CooperativesDomainError("Choose a valid recorded contribution.");
    }

    const reversed = await tx.cooperativeContribution.update({
      where: { id: contribution.id },
      data: {
        status: "REVERSED",
        reversedAt: new Date(),
        reversalReason: reason,
      },
    });

    const amount = contribution.amount.toNumber();
    const penaltyAmount = contribution.penaltyAmount.toNumber();
    const totalCash = amount + penaltyAmount;

    await postCooperativeLedgerBatch({
      tx,
      businessId,
      groupId,
      eventType: "CONTRIBUTION_REVERSAL",
      sourceType: "cooperative_contribution",
      sourceId: contribution.id,
      idempotencyKey: `reversal:${contribution.id}`,
      memo: reason,
      postedByUserId: actorId,
      entryDate: new Date(),
      entries: [
        {
          accountCode: "MEMBER_SAVINGS",
          debit: amount,
          memberId: contribution.memberId,
          contributionId: contribution.id,
          reference: contribution.reference,
        },
        ...(penaltyAmount > 0
          ? [
              {
                accountCode: "PENALTY_INCOME" as const,
                debit: penaltyAmount,
                memberId: contribution.memberId,
                contributionId: contribution.id,
                reference: contribution.reference,
              },
            ]
          : []),
        {
          accountCode: "CASH_CONTROL",
          credit: totalCash,
          memberId: contribution.memberId,
          contributionId: contribution.id,
          reference: contribution.reference,
        },
      ],
    });

    return reversed;
  });
}

export async function assertMemberBelongsToGroup(
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
    throw new CooperativesDomainError("Choose a valid cooperative member.");
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
      active: true,
    },
    select: { id: true },
  });

  if (!plan) {
    throw new CooperativesDomainError("Choose a valid contribution plan.");
  }
}

function maskText(value: string | null) {
  if (!value) {
    return null;
  }

  if (value.length <= 4) {
    return "****";
  }

  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function maskEmail(value: string | null) {
  if (!value) {
    return null;
  }

  const [name, domain] = value.split("@");

  if (!domain) {
    return maskText(value);
  }

  return `${name.slice(0, 1)}***@${domain}`;
}
