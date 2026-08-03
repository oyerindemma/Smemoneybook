import { CooperativesDomainError } from "@/lib/cooperatives/api";
import { postCooperativeLedgerBatch } from "@/lib/cooperatives/ledger";
import { getPrisma } from "@/lib/prisma";

export async function recordCooperativeLoanRepayment({
  businessId,
  groupId,
  loanId,
  scheduleId,
  amount,
  principalPortion,
  interestPortion,
  penaltyPortion,
  paidAt = new Date(),
  reference,
  paymentReference,
  idempotencyKey,
  actorId,
}: {
  businessId: string;
  groupId: string;
  loanId: string;
  scheduleId?: string;
  amount: number;
  principalPortion?: number;
  interestPortion?: number;
  penaltyPortion?: number;
  paidAt?: Date;
  reference?: string;
  paymentReference?: string;
  idempotencyKey?: string;
  actorId?: string;
}) {
  if (amount <= 0) {
    throw new CooperativesDomainError("Repayment amount must be greater than zero.");
  }

  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const loan = await tx.cooperativeLoan.findFirst({
      where: { id: loanId, businessId, groupId },
      include: {
        repaymentSchedules: {
          orderBy: [{ dueDate: "asc" }, { instalmentNumber: "asc" }],
        },
        repayments: {
          where: { reversedAt: null },
        },
      },
    });

    if (!loan) {
      throw new CooperativesDomainError("Choose a valid cooperative loan.");
    }

    if (!["active", "disbursed_recorded"].includes(loan.status.toLowerCase())) {
      throw new CooperativesDomainError("Only active cooperative loans can accept repayments.");
    }

    if (idempotencyKey) {
      const existing = await tx.cooperativeLoanRepayment.findUnique({
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

    const schedule =
      (scheduleId ? loan.repaymentSchedules.find((item) => item.id === scheduleId) : null) ??
      loan.repaymentSchedules.find((item) => item.status !== "PAID") ??
      null;

    if (scheduleId && !schedule) {
      throw new CooperativesDomainError("Choose a valid repayment schedule item.");
    }

    const allocation =
      principalPortion !== undefined || interestPortion !== undefined || penaltyPortion !== undefined
        ? explicitAllocation({
            amount,
            principalPortion,
            interestPortion,
            penaltyPortion,
          })
        : automaticAllocation({
            amount,
            principalDue: schedule?.principalDue.toNumber() ?? amount,
            interestDue: schedule?.interestDue.toNumber() ?? 0,
            penaltyDue: schedule?.penaltyDue.toNumber() ?? 0,
          });

    const repayment = await tx.cooperativeLoanRepayment.create({
      data: {
        businessId,
        groupId,
        loanId,
        scheduleId: schedule?.id,
        memberId: loan.memberId,
        amount,
        principalPortion: allocation.principalPortion,
        interestPortion: allocation.interestPortion,
        penaltyPortion: allocation.penaltyPortion,
        paidAt,
        repaymentDate: paidAt,
        reference,
        paymentReference,
        idempotencyKey,
        recordedById: actorId,
      },
    });

    if (schedule) {
      const paidAmount = roundMoney(schedule.paidAmount.toNumber() + amount);
      const totalDue = schedule.totalDue.toNumber();
      const status = paidAmount >= totalDue ? "PAID" : paidAt > schedule.dueDate ? "IN_ARREARS" : "PARTIAL";

      await tx.cooperativeRepaymentSchedule.update({
        where: { id: schedule.id },
        data: {
          paidAmount,
          status,
        },
      });
    }

    await postCooperativeLedgerBatch({
      tx,
      businessId,
      groupId,
      eventType: "LOAN_REPAYMENT",
      sourceType: "cooperative_loan_repayment",
      sourceId: repayment.id,
      idempotencyKey: idempotencyKey ? `ledger:${idempotencyKey}` : undefined,
      memo: "Cooperative loan repayment recorded.",
      postedByUserId: actorId,
      entryDate: paidAt,
      entries: [
        {
          accountCode: "CASH_CONTROL",
          debit: amount,
          memberId: loan.memberId,
          loanId: loan.id,
          repaymentId: repayment.id,
          reference,
        },
        {
          accountCode: "LOANS_RECEIVABLE",
          credit: allocation.principalPortion,
          memberId: loan.memberId,
          loanId: loan.id,
          repaymentId: repayment.id,
          reference,
        },
        ...(allocation.interestPortion > 0
          ? [
              {
                accountCode: "INTEREST_INCOME" as const,
                credit: allocation.interestPortion,
                memberId: loan.memberId,
                loanId: loan.id,
                repaymentId: repayment.id,
                reference,
              },
            ]
          : []),
        ...(allocation.penaltyPortion > 0
          ? [
              {
                accountCode: "PENALTY_INCOME" as const,
                credit: allocation.penaltyPortion,
                memberId: loan.memberId,
                loanId: loan.id,
                repaymentId: repayment.id,
                reference,
              },
            ]
          : []),
      ],
    });

    const totalRepaid = roundMoney(
      loan.repayments.reduce((sum, item) => sum + item.amount.toNumber(), 0) + amount,
    );

    if (totalRepaid >= loan.totalDue.toNumber()) {
      await tx.cooperativeLoan.update({
        where: { id: loan.id },
        data: {
          status: "completed",
          completedAt: new Date(),
        },
      });
    }

    return repayment;
  });
}

export async function listCooperativeLoanArrears({
  businessId,
  groupId,
  asOf = new Date(),
}: {
  businessId: string;
  groupId: string;
  asOf?: Date;
}) {
  return getPrisma().cooperativeRepaymentSchedule.findMany({
    where: {
      businessId,
      groupId,
      dueDate: { lt: asOf },
      status: { in: ["PENDING", "PARTIAL", "IN_ARREARS"] },
    },
    include: {
      loan: {
        include: {
          member: true,
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { instalmentNumber: "asc" }],
  });
}

function explicitAllocation({
  amount,
  principalPortion = 0,
  interestPortion = 0,
  penaltyPortion = 0,
}: {
  amount: number;
  principalPortion?: number;
  interestPortion?: number;
  penaltyPortion?: number;
}) {
  const total = roundMoney(principalPortion + interestPortion + penaltyPortion);

  if (total !== roundMoney(amount)) {
    throw new CooperativesDomainError("Repayment allocation must equal the repayment amount.");
  }

  return {
    principalPortion,
    interestPortion,
    penaltyPortion,
  };
}

function automaticAllocation({
  amount,
  principalDue,
  interestDue,
  penaltyDue,
}: {
  amount: number;
  principalDue: number;
  interestDue: number;
  penaltyDue: number;
}) {
  let remaining = amount;
  const penaltyPortion = Math.min(remaining, penaltyDue);
  remaining = roundMoney(remaining - penaltyPortion);
  const interestPortion = Math.min(remaining, interestDue);
  remaining = roundMoney(remaining - interestPortion);
  const principalPortion = roundMoney(Math.min(remaining, Math.max(principalDue, remaining)));
  const allocatedTotal = roundMoney(principalPortion + interestPortion + penaltyPortion);

  if (allocatedTotal !== roundMoney(amount)) {
    return {
      principalPortion: roundMoney(amount - interestPortion - penaltyPortion),
      interestPortion,
      penaltyPortion,
    };
  }

  return {
    principalPortion,
    interestPortion,
    penaltyPortion,
  };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
