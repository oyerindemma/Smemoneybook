import { Prisma, TransactionType } from "@prisma/client";
import { CooperativesDomainError } from "@/lib/cooperatives/api";
import { getPrisma } from "@/lib/prisma";
import {
  calculateContributionArrears,
  summarizeCooperativeLedger,
  validateCooperativeLedgerEntries,
  type CooperativeLedgerSummary,
} from "@/lib/phase3/cooperative-ledger";

export {
  calculateContributionArrears,
  summarizeCooperativeLedger,
  validateCooperativeLedgerEntries,
  type CooperativeLedgerSummary,
};

export const cooperativeLedgerFormulaVersion = "cooperative-ledger-v2-balanced-batches";

export const cooperativeAccountDefinitions = [
  {
    code: "CASH_CONTROL",
    name: "Cooperative cash control",
    accountType: "asset",
    normalBalance: "debit",
  },
  {
    code: "LOANS_RECEIVABLE",
    name: "Member loans receivable",
    accountType: "asset",
    normalBalance: "debit",
  },
  {
    code: "MEMBER_SAVINGS",
    name: "Member savings liability",
    accountType: "liability",
    normalBalance: "credit",
  },
  {
    code: "INTEREST_INCOME",
    name: "Cooperative interest income",
    accountType: "income",
    normalBalance: "credit",
  },
  {
    code: "PENALTY_INCOME",
    name: "Cooperative penalty income",
    accountType: "income",
    normalBalance: "credit",
  },
  {
    code: "TRANSFER_CLEARING",
    name: "Business ledger transfer clearing",
    accountType: "equity",
    normalBalance: "credit",
  },
] as const;

export type CooperativeAccountCode = (typeof cooperativeAccountDefinitions)[number]["code"];

export type CooperativeLedgerPostingLine = {
  accountCode: CooperativeAccountCode;
  debit?: number;
  credit?: number;
  memberId?: string | null;
  contributionId?: string | null;
  loanId?: string | null;
  repaymentId?: string | null;
  expenseId?: string | null;
  distributionId?: string | null;
  memo?: string;
  reference?: string | null;
};

export async function ensureCooperativeLedgerAccounts({
  tx,
  businessId,
  groupId,
}: {
  tx?: Prisma.TransactionClient;
  businessId: string;
  groupId: string;
}) {
  const client = tx ?? getPrisma();

  await Promise.all(
    cooperativeAccountDefinitions.map((account) =>
      client.cooperativeLedgerAccount.upsert({
        where: {
          groupId_code: {
            groupId,
            code: account.code,
          },
        },
        create: {
          businessId,
          groupId,
          ...account,
        },
        update: {
          name: account.name,
          accountType: account.accountType,
          normalBalance: account.normalBalance,
          active: true,
        },
      }),
    ),
  );

  return client.cooperativeLedgerAccount.findMany({
    where: { businessId, groupId, active: true },
  });
}

export async function postCooperativeLedgerBatch({
  tx,
  businessId,
  groupId,
  eventType,
  sourceType,
  sourceId,
  idempotencyKey,
  memo,
  postedByUserId,
  entryDate = new Date(),
  entries,
}: {
  tx: Prisma.TransactionClient;
  businessId: string;
  groupId: string;
  eventType: string;
  sourceType?: string;
  sourceId?: string;
  idempotencyKey?: string;
  memo?: string;
  postedByUserId?: string;
  entryDate?: Date;
  entries: CooperativeLedgerPostingLine[];
}) {
  assertLedgerBatchBalanced(entries);

  if (idempotencyKey) {
    const existing = await tx.cooperativeLedgerBatch.findUnique({
      where: {
        businessId_idempotencyKey: {
          businessId,
          idempotencyKey,
        },
      },
      include: { entries: true },
    });

    if (existing) {
      return existing;
    }
  }

  const accounts = await ensureCooperativeLedgerAccounts({ tx, businessId, groupId });
  const accountByCode = new Map(accounts.map((account) => [account.code, account]));
  const missingAccount = entries.find((entry) => !accountByCode.has(entry.accountCode));

  if (missingAccount) {
    throw new CooperativesDomainError(`Unknown cooperative ledger account ${missingAccount.accountCode}.`);
  }

  return tx.cooperativeLedgerBatch.create({
    data: {
      businessId,
      groupId,
      eventType,
      sourceType,
      sourceId,
      idempotencyKey,
      memo,
      postedByUserId,
      entries: {
        create: entries.map((entry) => {
          const account = accountByCode.get(entry.accountCode);

          return {
            businessId,
            groupId,
            batchId: undefined,
            accountId: account?.id,
            accountCode: entry.accountCode,
            memberId: entry.memberId ?? undefined,
            contributionId: entry.contributionId ?? undefined,
            loanId: entry.loanId ?? undefined,
            repaymentId: entry.repaymentId ?? undefined,
            expenseId: entry.expenseId ?? undefined,
            distributionId: entry.distributionId ?? undefined,
            entryDate,
            entryType: eventType,
            debit: entry.debit ?? 0,
            credit: entry.credit ?? 0,
            memo: entry.memo ?? memo,
            reference: entry.reference ?? undefined,
            sourceType,
            sourceId,
            postedByUserId,
            postedAt: entryDate,
            createdById: postedByUserId,
          };
        }),
      },
    },
    include: { entries: true },
  });
}

export function assertLedgerBatchBalanced(entries: CooperativeLedgerPostingLine[]) {
  if (entries.length < 2) {
    throw new CooperativesDomainError("A cooperative ledger batch needs at least two posting lines.");
  }

  const totals = entries.reduce(
    (next, entry) => {
      const debit = roundMoney(entry.debit ?? 0);
      const credit = roundMoney(entry.credit ?? 0);

      if (debit < 0 || credit < 0) {
        throw new CooperativesDomainError("Cooperative ledger entries cannot be negative.");
      }

      if (debit > 0 && credit > 0) {
        throw new CooperativesDomainError("A cooperative ledger entry cannot debit and credit at the same time.");
      }

      if (debit === 0 && credit === 0) {
        throw new CooperativesDomainError("A cooperative ledger entry must move money.");
      }

      return {
        debit: roundMoney(next.debit + debit),
        credit: roundMoney(next.credit + credit),
      };
    },
    { debit: 0, credit: 0 },
  );

  if (totals.debit <= 0 || totals.credit <= 0 || totals.debit !== totals.credit) {
    throw new CooperativesDomainError("Cooperative ledger batch debits and credits must balance.");
  }
}

export async function recordCooperativeLedgerTransfer({
  businessId,
  groupId,
  direction,
  amount,
  currency = "NGN",
  memo,
  reference,
  actorId,
  accountId,
}: {
  businessId: string;
  groupId: string;
  direction: "business_to_cooperative" | "cooperative_to_business";
  amount: number;
  currency?: string;
  memo?: string;
  reference?: string;
  actorId?: string;
  accountId?: string;
}) {
  if (amount <= 0) {
    throw new CooperativesDomainError("Transfer amount must be greater than zero.");
  }

  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    await assertGroupBelongsToBusiness(tx, { businessId, groupId });

    const idempotencyKey = reference ? `cooperative_transfer:${reference}` : undefined;
    const batch = await postCooperativeLedgerBatch({
      tx,
      businessId,
      groupId,
      eventType: "TRANSFER",
      sourceType: "cooperative_transfer",
      idempotencyKey,
      memo: memo ?? "Cooperative transfer recorded.",
      postedByUserId: actorId,
      entries:
        direction === "business_to_cooperative"
          ? [
              { accountCode: "CASH_CONTROL", debit: amount, memo, reference },
              { accountCode: "TRANSFER_CLEARING", credit: amount, memo, reference },
            ]
          : [
              { accountCode: "TRANSFER_CLEARING", debit: amount, memo, reference },
              { accountCode: "CASH_CONTROL", credit: amount, memo, reference },
            ],
    });

    const transaction = accountId
      ? await tx.transaction.create({
          data: {
            businessId,
            accountId,
            idempotencyKey: idempotencyKey ?? `cooperative_transfer:${Date.now()}`,
            type: TransactionType.TRANSFER,
            amount,
            description: memo ?? "Cooperative ledger transfer",
            category: "Cooperatives",
            occurredAt: new Date(),
          },
        })
      : null;

    return tx.cooperativeLedgerTransfer.create({
      data: {
        businessId,
        groupId,
        cooperativeLedgerBatchId: batch.id,
        businessTransactionId: transaction?.id,
        direction,
        amount,
        currency,
        memo,
        reference,
        requestedByUserId: actorId,
        approvedByUserId: actorId,
        approvedAt: new Date(),
      },
      include: {
        cooperativeLedgerBatch: {
          include: { entries: true },
        },
        businessTransaction: true,
      },
    });
  });
}

export async function assertGroupBelongsToBusiness(
  tx: Prisma.TransactionClient,
  {
    businessId,
    groupId,
  }: {
    businessId: string;
    groupId: string;
  },
) {
  const group = await tx.cooperativeGroup.findFirst({
    where: {
      id: groupId,
      businessId,
      archivedAt: null,
    },
    select: { id: true },
  });

  if (!group) {
    throw new CooperativesDomainError("Choose a valid cooperative group.");
  }
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
