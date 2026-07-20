import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  bankReconciliationSnapshotVersion,
  buildBankStatementFileHash,
  parseBankStatementCsv,
  suggestBankReconciliationMatches,
  type ParsedBankStatementRow,
} from "@/lib/phase3/bank-reconciliation";

export type BankStatementImportInput = {
  businessId: string;
  userId: string;
  csv: string;
  fileName?: string;
  accountId?: string;
  locationId?: string;
};

export async function importBankStatementForBusiness({
  businessId,
  userId,
  csv,
  fileName,
  accountId,
  locationId,
}: BankStatementImportInput) {
  const parsed = parseBankStatementCsv(csv);

  if (parsed.errors.length > 0) {
    const firstErrors = parsed.errors
      .slice(0, 3)
      .map((error) => `row ${error.rowNumber}: ${error.message}`)
      .join("; ");
    throw new Error(`Statement import has invalid rows: ${firstErrors}`);
  }

  if (parsed.rows.length === 0) {
    throw new Error("Statement import did not contain any valid rows.");
  }

  const prisma = getPrisma();
  const fileHash = buildBankStatementFileHash(csv);
  const existingImport = await prisma.bankStatementImport.findUnique({
    where: {
      businessId_fileHash: {
        businessId,
        fileHash,
      },
    },
    select: { id: true },
  });

  if (existingImport) {
    throw new Error("This bank statement file has already been imported.");
  }

  if (accountId) {
    const account = await prisma.account.findFirst({
      where: { id: accountId, businessId },
      select: { id: true },
    });

    if (!account) {
      throw new Error("Choose a valid account for reconciliation.");
    }
  }

  const dateBufferDays = 4;
  const transactionStart = addDays(parsed.statementStart ?? new Date(), -dateBufferDays);
  const transactionEnd = addDays(parsed.statementEnd ?? new Date(), dateBufferDays);
  const transactions = await prisma.transaction.findMany({
    where: {
      businessId,
      paymentStatus: "PAID",
      occurredAt: { gte: transactionStart, lt: transactionEnd },
      ...(locationId ? { locationId } : {}),
      ...(accountId
        ? {
            OR: [
              { accountId },
              { destinationAccountId: accountId },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      type: true,
      amount: true,
      paymentStatus: true,
      occurredAt: true,
      description: true,
      category: true,
      accountId: true,
      destinationAccountId: true,
      reversesTransactionId: true,
      reversalTransaction: { select: { id: true } },
      customer: { select: { name: true } },
      supplier: { select: { name: true } },
    },
  });

  return prisma.$transaction(async (tx) => {
    const statementImport = await tx.bankStatementImport.create({
      data: {
        businessId,
        accountId,
        locationId,
        uploadedById: userId,
        sourceType: "csv",
        fileName,
        fileHash,
        statementStart: parsed.statementStart,
        statementEnd: parsed.statementEnd,
        rowCount: parsed.rows.length,
        duplicateRowCount: parsed.duplicateRowCount,
        metadata: {
          snapshotVersion: bankReconciliationSnapshotVersion,
          parserWarnings: parsed.warnings,
        } as Prisma.InputJsonObject,
      },
    });
    const createdRows = [] as Array<ParsedBankStatementRow & { id: string }>;
    const rowNumberToId = new Map<number, string>();

    for (const row of parsed.rows) {
      const created = await tx.bankStatementImportRow.create({
        data: {
          importId: statementImport.id,
          businessId,
          rowNumber: row.rowNumber,
          postedAt: row.postedAt,
          amount: row.amount,
          direction: row.direction,
          description: row.description,
          reference: row.reference,
          balance: row.balance,
          fingerprint: row.fingerprint,
          status: row.duplicateOfRowNumber ? "DUPLICATE" : "UNMATCHED",
          suggestedCategory: row.suggestedCategory,
          raw: row.raw as Prisma.InputJsonObject,
        },
      });

      rowNumberToId.set(row.rowNumber, created.id);
      createdRows.push({ ...row, id: created.id });
    }

    for (const row of createdRows) {
      if (!row.duplicateOfRowNumber) {
        continue;
      }

      const duplicateOfRowId = rowNumberToId.get(row.duplicateOfRowNumber);
      if (!duplicateOfRowId) {
        continue;
      }

      row.duplicateOfRowId = duplicateOfRowId;
      await tx.bankStatementImportRow.update({
        where: { id: row.id },
        data: { duplicateOfRowId },
      });
    }

    const suggestions = suggestBankReconciliationMatches({
      rows: createdRows,
      transactions: transactions.map((transaction) => ({
        id: transaction.id,
        type: transaction.type.toLowerCase(),
        amount: transaction.amount.toNumber(),
        paymentStatus: transaction.paymentStatus.toLowerCase(),
        occurredAt: transaction.occurredAt,
        description: transaction.description,
        category: transaction.category,
        accountId: transaction.accountId,
        destinationAccountId: transaction.destinationAccountId,
        customerName: transaction.customer?.name,
        supplierName: transaction.supplier?.name,
        reversed: Boolean(transaction.reversalTransaction),
        isReversal: Boolean(transaction.reversesTransactionId),
      })),
      accountId,
    });

    for (const suggestion of suggestions) {
      const rowId = suggestion.rowId;
      if (!rowId) {
        continue;
      }

      await tx.bankReconciliationMatch.create({
        data: {
          businessId,
          importId: statementImport.id,
          rowId,
          transactionId: suggestion.transactionId,
          accountId,
          status: suggestion.status,
          matchType: suggestion.matchType,
          confidence: suggestion.confidence,
          signals: suggestion.signals as Prisma.InputJsonObject,
          createdById: userId,
        },
      });

      if (suggestion.transactionId) {
        await tx.bankStatementImportRow.update({
          where: { id: rowId },
          data: { status: "SUGGESTED" },
        });
      }
    }

    const suggestedMatchCount = suggestions.filter((suggestion) => suggestion.transactionId).length;
    await tx.bankStatementImport.update({
      where: { id: statementImport.id },
      data: { matchedCount: suggestedMatchCount },
    });

    return {
      importId: statementImport.id,
      rowCount: parsed.rows.length,
      duplicateRowCount: parsed.duplicateRowCount,
      suggestedMatchCount,
      warnings: parsed.warnings,
      suggestions,
    };
  });
}

export async function getBankReconciliationImport({
  businessId,
  importId,
}: {
  businessId: string;
  importId: string;
}) {
  return getPrisma().bankStatementImport.findFirst({
    where: { id: importId, businessId },
    include: {
      rows: {
        orderBy: { rowNumber: "asc" },
        include: {
          matches: {
            orderBy: { confidence: "desc" },
            include: {
              transaction: {
                select: {
                  id: true,
                  type: true,
                  amount: true,
                  description: true,
                  occurredAt: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

export async function listBankReconciliationImports({ businessId }: { businessId: string }) {
  return getPrisma().bankStatementImport.findMany({
    where: { businessId },
    orderBy: { importedAt: "desc" },
    take: 20,
    select: {
      id: true,
      fileName: true,
      status: true,
      rowCount: true,
      matchedCount: true,
      duplicateRowCount: true,
      statementStart: true,
      statementEnd: true,
      importedAt: true,
      lockedAt: true,
      version: true,
    },
  });
}

export async function confirmBankReconciliationMatch({
  businessId,
  userId,
  matchId,
  notes,
}: {
  businessId: string;
  userId: string;
  matchId: string;
  notes?: string;
}) {
  const prisma = getPrisma();
  const match = await prisma.bankReconciliationMatch.findFirst({
    where: { id: matchId, businessId },
    include: { statementImport: true },
  });

  if (!match) {
    throw new Error("Choose a valid reconciliation match.");
  }

  if (match.statementImport.status === "LOCKED") {
    throw new Error("This reconciliation is locked. Reopen it before making changes.");
  }

  if (!match.transactionId) {
    throw new Error("Missing-record suggestions cannot be confirmed as matches.");
  }

  await prisma.$transaction([
    prisma.bankReconciliationMatch.update({
      where: { id: match.id },
      data: {
        status: "CONFIRMED",
        confirmedById: userId,
        confirmedAt: new Date(),
        notes,
      },
    }),
    prisma.bankStatementImportRow.update({
      where: { id: match.rowId },
      data: { status: "MATCHED" },
    }),
  ]);

  return updateImportMatchCount(match.importId);
}

export async function rejectBankReconciliationMatch({
  businessId,
  userId,
  matchId,
  notes,
}: {
  businessId: string;
  userId: string;
  matchId: string;
  notes?: string;
}) {
  const prisma = getPrisma();
  const match = await prisma.bankReconciliationMatch.findFirst({
    where: { id: matchId, businessId },
    include: { statementImport: true },
  });

  if (!match) {
    throw new Error("Choose a valid reconciliation match.");
  }

  if (match.statementImport.status === "LOCKED") {
    throw new Error("This reconciliation is locked. Reopen it before making changes.");
  }

  await prisma.bankReconciliationMatch.update({
    where: { id: match.id },
    data: {
      status: "REJECTED",
      rejectedById: userId,
      rejectedAt: new Date(),
      notes,
    },
  });

  const confirmedForRow = await prisma.bankReconciliationMatch.count({
    where: { rowId: match.rowId, status: "CONFIRMED" },
  });

  if (confirmedForRow === 0) {
    await prisma.bankStatementImportRow.update({
      where: { id: match.rowId },
      data: { status: "UNMATCHED" },
    });
  }

  return updateImportMatchCount(match.importId);
}

export async function lockBankStatementImport({
  businessId,
  importId,
}: {
  businessId: string;
  importId: string;
}) {
  const prisma = getPrisma();
  const statementImport = await prisma.bankStatementImport.findFirst({
    where: { id: importId, businessId },
  });

  if (!statementImport) {
    throw new Error("Choose a valid bank statement import.");
  }

  const unresolvedRows = await prisma.bankStatementImportRow.count({
    where: {
      importId,
      status: { in: ["UNMATCHED", "SUGGESTED"] },
    },
  });

  if (unresolvedRows > 0) {
    throw new Error("Review unmatched and suggested rows before locking this reconciliation.");
  }

  return prisma.bankStatementImport.update({
    where: { id: importId },
    data: {
      status: "LOCKED",
      lockedAt: new Date(),
    },
  });
}

export async function reopenBankStatementImport({
  businessId,
  importId,
}: {
  businessId: string;
  importId: string;
}) {
  const prisma = getPrisma();
  const statementImport = await prisma.bankStatementImport.findFirst({
    where: { id: importId, businessId },
  });

  if (!statementImport) {
    throw new Error("Choose a valid bank statement import.");
  }

  if (statementImport.status !== "LOCKED") {
    throw new Error("Only locked reconciliations can be reopened.");
  }

  return prisma.bankStatementImport.update({
    where: { id: importId },
    data: {
      status: "REOPENED",
      lockedAt: null,
      reopenedAt: new Date(),
      version: { increment: 1 },
    },
  });
}

async function updateImportMatchCount(importId: string) {
  const prisma = getPrisma();
  const matchedCount = await prisma.bankReconciliationMatch.count({
    where: { importId, status: "CONFIRMED" },
  });

  return prisma.bankStatementImport.update({
    where: { id: importId },
    data: { matchedCount },
  });
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}
