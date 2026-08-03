import { CooperativesDomainError } from "@/lib/cooperatives/api";
import { getPrisma } from "@/lib/prisma";

export type CooperativeMemberStatement = {
  member: {
    id: string;
    memberNumber: string | null;
    displayName: string;
    fullName: string | null;
    phone: string | null;
    email: string | null;
    status: string;
  };
  period: {
    from: string | null;
    to: string | null;
  };
  totals: {
    contributions: number;
    penalties: number;
    loanPrincipal: number;
    repayments: number;
    outstandingLoans: number;
    savingsBalance: number;
  };
  movements: Array<{
    id: string;
    date: string;
    type: string;
    debit: number;
    credit: number;
    memo: string | null;
    reference: string | null;
  }>;
};

export async function getCooperativeMemberStatement({
  businessId,
  groupId,
  memberId,
  from,
  to,
  includeSensitive = false,
}: {
  businessId: string;
  groupId: string;
  memberId: string;
  from?: Date;
  to?: Date;
  includeSensitive?: boolean;
}): Promise<CooperativeMemberStatement> {
  const member = await getPrisma().cooperativeMember.findFirst({
    where: {
      id: memberId,
      businessId,
      groupId,
    },
    include: {
      contributions: {
        where: dateWindow("paidAt", from, to),
        orderBy: { paidAt: "asc" },
      },
      loans: {
        include: {
          repayments: true,
        },
      },
      ledgerEntries: {
        where: dateWindow("entryDate", from, to),
        orderBy: { entryDate: "asc" },
      },
    },
  });

  if (!member) {
    throw new CooperativesDomainError("Choose a valid cooperative member.");
  }

  const contributions = member.contributions.filter((contribution) => contribution.status !== "REVERSED");
  const loanPrincipal = member.loans.reduce((sum, loan) => sum + loan.disbursedAmount.toNumber(), 0);
  const repayments = member.loans.flatMap((loan) => loan.repayments);
  const repaymentTotal = repayments.reduce((sum, repayment) => sum + repayment.amount.toNumber(), 0);
  const outstandingLoans = member.loans.reduce((sum, loan) => {
    const paid = loan.repayments.reduce((repaymentSum, repayment) => repaymentSum + repayment.amount.toNumber(), 0);
    return sum + Math.max(0, loan.totalDue.toNumber() - paid);
  }, 0);
  const savingsBalance = member.ledgerEntries.reduce(
    (sum, entry) => sum + entry.credit.toNumber() - entry.debit.toNumber(),
    0,
  );

  return {
    member: {
      id: member.id,
      memberNumber: member.memberNumber,
      displayName: member.displayName,
      fullName: includeSensitive ? member.fullName : null,
      phone: includeSensitive ? member.phone : maskText(member.phone),
      email: includeSensitive ? member.email : maskEmail(member.email),
      status: member.status,
    },
    period: {
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
    },
    totals: {
      contributions: roundMoney(contributions.reduce((sum, contribution) => sum + contribution.amount.toNumber(), 0)),
      penalties: roundMoney(contributions.reduce((sum, contribution) => sum + contribution.penaltyAmount.toNumber(), 0)),
      loanPrincipal: roundMoney(loanPrincipal),
      repayments: roundMoney(repaymentTotal),
      outstandingLoans: roundMoney(outstandingLoans),
      savingsBalance: roundMoney(savingsBalance),
    },
    movements: member.ledgerEntries.map((entry) => ({
      id: entry.id,
      date: entry.entryDate.toISOString(),
      type: entry.entryType,
      debit: entry.debit.toNumber(),
      credit: entry.credit.toNumber(),
      memo: entry.memo,
      reference: entry.reference,
    })),
  };
}

function dateWindow(field: "paidAt" | "entryDate", from?: Date, to?: Date) {
  if (!from && !to) {
    return undefined;
  }

  return {
    [field]: {
      gte: from,
      lte: to,
    },
  };
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

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
