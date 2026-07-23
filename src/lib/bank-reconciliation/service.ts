import { Prisma } from "@prisma/client";
import { BankReconciliationDomainError } from "@/lib/bank-reconciliation/api";
import {
  bankReconciliationSnapshotVersion,
  type BankReconciliationActionName,
  type BankStatementColumnMapping,
  type BankStatementPreview,
  type BankStatementRowStatus,
  type ParsedBankStatementRow,
  type ReconciliationTransaction,
} from "@/lib/bank-reconciliation/definitions";
import {
  bankReconciliationCsvFilename,
  bankReconciliationRowsToCsv,
  type BankReconciliationExportRow,
} from "@/lib/bank-reconciliation/export";
import { suggestBankReconciliationMatches } from "@/lib/bank-reconciliation/matcher";
import { addDays, buildBankStatementFileHash } from "@/lib/bank-reconciliation/normalizer";
import {
  parseBankStatementCsv,
  previewParsedBankStatement,
} from "@/lib/bank-reconciliation/parser";
import { getPrisma } from "@/lib/prisma";

export type BankStatementImportInput = {
  businessId: string;
  userId: string;
  csv: string;
  fileName?: string;
  fileSize?: number;
  accountId?: string;
  locationId?: string;
  bankProfileId?: string;
  accountLabel?: string;
  bankName?: string;
  currency?: string;
  openingBalance?: number;
  closingBalance?: number;
  mapping?: BankStatementColumnMapping;
};

export async function previewBankStatementForBusiness({
  businessId,
  csv,
  mapping,
}: {
  businessId: string;
  csv: string;
  mapping?: BankStatementColumnMapping;
}): Promise<BankStatementPreview> {
  const parsed = parseBankStatementCsv(csv, mapping);
  const duplicates = await findExistingRowsByFingerprint({
    businessId,
    fingerprints: parsed.rows.map((row) => row.fingerprint),
  });
  let crossImportDuplicateCount = 0;

  for (const row of parsed.rows) {
    const existing = duplicates.get(row.fingerprint);

    if (existing) {
      row.duplicateOfRowId = existing.id;

      if (row.duplicateStatus === "UNIQUE") {
        row.duplicateStatus = "PROBABLE_DUPLICATE";
        crossImportDuplicateCount += 1;
      }
    }
  }

  return previewParsedBankStatement(parsed, crossImportDuplicateCount);
}

export async function importBankStatementForBusiness({
  businessId,
  userId,
  csv,
  fileName,
  fileSize,
  accountId,
  locationId,
  bankProfileId,
  accountLabel,
  bankName,
  currency = "NGN",
  openingBalance,
  closingBalance,
  mapping,
}: BankStatementImportInput) {
  const parsed = parseBankStatementCsv(csv, mapping);

  if (parsed.errors.length > 0) {
    const firstErrors = parsed.errors
      .slice(0, 3)
      .map((error) => `row ${error.rowNumber}: ${error.message}`)
      .join("; ");
    throw new BankReconciliationDomainError(
      `Statement import has invalid rows: ${firstErrors}`,
      400,
      "invalid_statement_rows",
    );
  }

  if (parsed.rows.length === 0) {
    throw new BankReconciliationDomainError(
      "Statement import did not contain any valid rows.",
      400,
      "empty_statement",
    );
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
    throw new BankReconciliationDomainError(
      "This bank statement file has already been imported.",
      409,
      "duplicate_statement_file",
    );
  }

  await validateImportReferences({
    businessId,
    accountId,
    locationId,
    bankProfileId,
  });

  const existingRowsByFingerprint = await findExistingRowsByFingerprint({
    businessId,
    fingerprints: parsed.rows.map((row) => row.fingerprint),
  });
  const dateBufferDays = 4;
  const transactionStart = addDays(parsed.statementStart ?? new Date(), -dateBufferDays);
  const transactionEnd = addDays(parsed.statementEnd ?? new Date(), dateBufferDays);
  const [transactions, excludedTransactionIds] = await Promise.all([
    listCandidateTransactions({
      businessId,
      accountId,
      locationId,
      transactionStart,
      transactionEnd,
    }),
    listConfirmedTransactionIds({ businessId }),
  ]);

  return prisma.$transaction(async (tx) => {
    const statementImport = await tx.bankStatementImport.create({
      data: {
        businessId,
        accountId,
        locationId,
        bankProfileId,
        uploadedById: userId,
        sourceType: "csv",
        fileName,
        accountLabel,
        bankName,
        fileHash,
        fileSize,
        currency,
        openingBalance,
        closingBalance,
        statementStart: parsed.statementStart,
        statementEnd: parsed.statementEnd,
        rowCount: parsed.rows.length,
        duplicateRowCount: parsed.rows.filter(
          (row) => row.duplicateOfRowNumber || existingRowsByFingerprint.has(row.fingerprint),
        ).length,
        metadata: {
          snapshotVersion: bankReconciliationSnapshotVersion,
          parserWarnings: parsed.warnings,
          mapping: parsed.mapping,
          totals: parsed.totals,
        } as Prisma.InputJsonObject,
      },
    });
    const createdRows = [] as Array<ParsedBankStatementRow & { id: string }>;
    const rowNumberToId = new Map<number, string>();

    for (const row of parsed.rows) {
      const existingDuplicate = existingRowsByFingerprint.get(row.fingerprint);
      const duplicateStatus = row.duplicateOfRowNumber || existingDuplicate
        ? "PROBABLE_DUPLICATE"
        : "UNIQUE";
      const status = duplicateStatus === "UNIQUE" ? "UNMATCHED" : "DUPLICATE";
      const created = await tx.bankStatementImportRow.create({
        data: {
          importId: statementImport.id,
          businessId,
          rowNumber: row.rowNumber,
          postedAt: row.postedAt,
          valueDate: row.valueDate,
          amount: row.amount,
          direction: row.direction,
          description: row.description,
          normalizedDescription: row.normalizedDescription,
          reference: row.reference,
          externalReference: row.externalReference,
          debitAmount: row.debitAmount,
          creditAmount: row.creditAmount,
          signedAmount: row.signedAmount,
          balance: row.balance,
          fingerprint: row.fingerprint,
          duplicateStatus,
          duplicateOfRowId: existingDuplicate?.id,
          status,
          suggestedCategory: row.suggestedCategory,
          raw: row.raw as Prisma.InputJsonObject,
        },
      });

      rowNumberToId.set(row.rowNumber, created.id);
      createdRows.push({
        ...row,
        id: created.id,
        duplicateStatus,
        duplicateOfRowId: existingDuplicate?.id,
      });
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
      transactions,
      accountId,
      excludedTransactionIds,
    });

    for (const suggestion of suggestions) {
      const rowId = suggestion.rowId;

      if (!rowId) {
        continue;
      }

      const match = await tx.bankReconciliationMatch.create({
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
          confidenceReasons: suggestion.confidenceReasons as Prisma.InputJsonArray,
          suggestedBy: "system",
          createdById: userId,
        },
      });

      if (suggestion.status === "DUPLICATE") {
        await recordReconciliationAction(tx, {
          businessId,
          userId,
          action: "match_suggested",
          entryId: rowId,
          matchId: match.id,
          reason: "Duplicate statement entry detected.",
          metadata: { matchType: "duplicate" },
        });
      } else if (suggestion.transactionId) {
        await tx.bankStatementImportRow.update({
          where: { id: rowId },
          data: { status: "SUGGESTED" },
        });
        await recordReconciliationAction(tx, {
          businessId,
          userId,
          action: "match_suggested",
          entryId: rowId,
          matchId: match.id,
          reason: "Candidate transaction suggested.",
          metadata: { confidence: suggestion.confidence, matchType: suggestion.matchType },
        });
      }
    }

    const suggestedMatchCount = suggestions.filter((suggestion) => suggestion.transactionId).length;
    await tx.bankStatementImport.update({
      where: { id: statementImport.id },
      data: { matchedCount: 0 },
    });
    await recordReconciliationAction(tx, {
      businessId,
      userId,
      action: "import_created",
      reason: "Bank statement CSV imported.",
      metadata: {
        importId: statementImport.id,
        rowCount: parsed.rows.length,
        duplicateRowCount: statementImport.duplicateRowCount,
        suggestedMatchCount,
        accountId: accountId ?? null,
        locationId: locationId ?? null,
      },
    });

    return {
      importId: statementImport.id,
      rowCount: parsed.rows.length,
      duplicateRowCount: statementImport.duplicateRowCount,
      suggestedMatchCount,
      warnings: parsed.warnings,
      preview: previewParsedBankStatement(parsed, statementImport.duplicateRowCount - parsed.duplicateRowCount),
      message: "Bank statement imported for review.",
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
        take: 500,
        include: {
          matches: {
            orderBy: [{ status: "asc" }, { confidence: "desc" }],
            include: {
              transaction: {
                select: {
                  id: true,
                  type: true,
                  amount: true,
                  description: true,
                  occurredAt: true,
                  accountId: true,
                  destinationAccountId: true,
                },
              },
            },
          },
          actions: {
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
      },
      bankProfile: true,
      account: { select: { id: true, name: true, type: true } },
      location: { select: { id: true, name: true } },
    },
  });
}

export async function listBankReconciliationImports({ businessId }: { businessId: string }) {
  return getPrisma().bankStatementImport.findMany({
    where: { businessId },
    orderBy: { importedAt: "desc" },
    take: 30,
    select: {
      id: true,
      fileName: true,
      accountLabel: true,
      bankName: true,
      status: true,
      rowCount: true,
      matchedCount: true,
      duplicateRowCount: true,
      statementStart: true,
      statementEnd: true,
      importedAt: true,
      lockedAt: true,
      version: true,
      account: { select: { id: true, name: true, type: true } },
      location: { select: { id: true, name: true } },
    },
  });
}

export async function listBankReconciliationEntries(filters: {
  businessId: string;
  importId?: string;
  status?: BankStatementRowStatus;
  duplicateStatus?: string;
  query?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}) {
  const where = buildEntryWhere(filters);
  const summaryWhere = buildEntryWhere({ ...filters, status: undefined });
  const prisma = getPrisma();
  const [entries, suggested, unmatched, matched, ignored, duplicates, total] = await Promise.all([
    prisma.bankStatementImportRow.findMany({
      where,
      orderBy: [{ postedAt: "desc" }, { rowNumber: "asc" }],
      take: filters.limit ?? 50,
      include: entryInclude(),
    }),
    prisma.bankStatementImportRow.count({ where: { ...summaryWhere, status: "SUGGESTED" } }),
    prisma.bankStatementImportRow.count({ where: { ...summaryWhere, status: "UNMATCHED" } }),
    prisma.bankStatementImportRow.count({ where: { ...summaryWhere, status: "MATCHED" } }),
    prisma.bankStatementImportRow.count({ where: { ...summaryWhere, status: "IGNORED" } }),
    prisma.bankStatementImportRow.count({ where: { ...summaryWhere, status: "DUPLICATE" } }),
    prisma.bankStatementImportRow.count({ where: summaryWhere }),
  ]);

  return {
    entries,
    summary: {
      total,
      suggested,
      unmatched,
      matched,
      ignored,
      duplicates,
      unresolved: suggested + unmatched + duplicates,
    },
  };
}

export async function getBankReconciliationEntry({
  businessId,
  entryId,
}: {
  businessId: string;
  entryId: string;
}) {
  return getPrisma().bankStatementImportRow.findFirst({
    where: { id: entryId, businessId },
    include: entryInclude(25),
  });
}

export async function getBankReconciliationEntrySuggestions({
  businessId,
  entryId,
}: {
  businessId: string;
  entryId: string;
}) {
  const prisma = getPrisma();
  const entry = await prisma.bankStatementImportRow.findFirst({
    where: { id: entryId, businessId },
    include: {
      statementImport: true,
      matches: {
        orderBy: [{ status: "asc" }, { confidence: "desc" }],
        include: {
          transaction: {
            select: {
              id: true,
              type: true,
              amount: true,
              description: true,
              occurredAt: true,
              accountId: true,
              destinationAccountId: true,
            },
          },
        },
      },
    },
  });

  if (!entry) {
    throw new BankReconciliationDomainError("Choose a valid bank statement entry.", 404, "entry_not_found");
  }

  const [transactions, excludedTransactionIds] = await Promise.all([
    listCandidateTransactions({
      businessId,
      accountId: entry.statementImport.accountId ?? undefined,
      locationId: entry.statementImport.locationId ?? undefined,
      transactionStart: addDays(entry.postedAt, -4),
      transactionEnd: addDays(entry.postedAt, 4),
    }),
    listConfirmedTransactionIds({ businessId, exceptRowId: entry.id }),
  ]);
  const suggestions = suggestBankReconciliationMatches({
    rows: [dbRowToParsed(entry)],
    transactions,
    accountId: entry.statementImport.accountId ?? undefined,
    excludedTransactionIds,
  });

  return {
    entry,
    suggestions,
    storedMatches: entry.matches,
  };
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
    include: { statementImport: true, row: true },
  });

  if (!match) {
    throw new BankReconciliationDomainError("Choose a valid reconciliation match.", 404, "match_not_found");
  }

  assertImportEditable(match.statementImport.status);

  if (!match.transactionId) {
    throw new BankReconciliationDomainError(
      "Missing-record or duplicate suggestions cannot be confirmed as matches.",
      400,
      "missing_transaction",
    );
  }

  await assertTransactionNotAlreadyConfirmed({
    businessId,
    transactionId: match.transactionId,
    exceptMatchId: match.id,
  });

  await prisma.$transaction(async (tx) => {
    await tx.bankReconciliationMatch.update({
      where: { id: match.id },
      data: {
        status: "CONFIRMED",
        confirmedById: userId,
        confirmedAt: new Date(),
        reviewedByUserId: userId,
        reviewedAt: new Date(),
        notes,
      },
    });
    await tx.bankReconciliationMatch.updateMany({
      where: {
        rowId: match.rowId,
        id: { not: match.id },
        status: "SUGGESTED",
      },
      data: {
        status: "REJECTED",
        rejectedById: userId,
        rejectedAt: new Date(),
        reviewedByUserId: userId,
        reviewedAt: new Date(),
      },
    });
    await tx.bankStatementImportRow.update({
      where: { id: match.rowId },
      data: { status: "MATCHED" },
    });
    await recordReconciliationAction(tx, {
      businessId,
      userId,
      action: "match_confirmed",
      entryId: match.rowId,
      matchId: match.id,
      reason: notes,
      metadata: { transactionId: match.transactionId },
    });
  });

  return updateImportProgress(match.importId);
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
    throw new BankReconciliationDomainError("Choose a valid reconciliation match.", 404, "match_not_found");
  }

  assertImportEditable(match.statementImport.status);

  await prisma.$transaction(async (tx) => {
    await tx.bankReconciliationMatch.update({
      where: { id: match.id },
      data: {
        status: "REJECTED",
        rejectedById: userId,
        rejectedAt: new Date(),
        reviewedByUserId: userId,
        reviewedAt: new Date(),
        notes,
      },
    });

    const confirmedForRow = await tx.bankReconciliationMatch.count({
      where: { rowId: match.rowId, status: "CONFIRMED" },
    });
    const suggestedForRow = await tx.bankReconciliationMatch.count({
      where: { rowId: match.rowId, status: "SUGGESTED", transactionId: { not: null } },
    });

    if (confirmedForRow === 0) {
      await tx.bankStatementImportRow.update({
        where: { id: match.rowId },
        data: { status: suggestedForRow > 0 ? "SUGGESTED" : "UNMATCHED" },
      });
    }

    await recordReconciliationAction(tx, {
      businessId,
      userId,
      action: "match_rejected",
      entryId: match.rowId,
      matchId: match.id,
      reason: notes,
    });
  });

  return updateImportProgress(match.importId);
}

export async function manualMatchBankReconciliationEntry({
  businessId,
  userId,
  entryId,
  transactionId,
  notes,
}: {
  businessId: string;
  userId: string;
  entryId: string;
  transactionId: string;
  notes?: string;
}) {
  const prisma = getPrisma();
  const [entry, transaction] = await Promise.all([
    prisma.bankStatementImportRow.findFirst({
      where: { id: entryId, businessId },
      include: { statementImport: true },
    }),
    prisma.transaction.findFirst({
      where: { id: transactionId, businessId },
      select: {
        id: true,
        paymentStatus: true,
      },
    }),
  ]);

  if (!entry) {
    throw new BankReconciliationDomainError("Choose a valid bank statement entry.", 404, "entry_not_found");
  }

  assertImportEditable(entry.statementImport.status);

  if (entry.status === "MATCHED") {
    throw new BankReconciliationDomainError("Unmatch this entry before creating another match.", 409, "already_matched");
  }

  if (entry.status === "IGNORED" || entry.status === "DUPLICATE") {
    throw new BankReconciliationDomainError("Reopen this entry before matching it.", 409, "entry_not_open");
  }

  if (!transaction || transaction.paymentStatus !== "PAID") {
    throw new BankReconciliationDomainError("Choose a paid transaction in this business.", 404, "transaction_not_found");
  }

  await assertTransactionNotAlreadyConfirmed({ businessId, transactionId });

  let createdMatchId = "";
  await prisma.$transaction(async (tx) => {
    const match = await tx.bankReconciliationMatch.create({
      data: {
        businessId,
        importId: entry.importId,
        rowId: entry.id,
        transactionId,
        accountId: entry.statementImport.accountId,
        status: "CONFIRMED",
        matchType: "manual",
        confidence: 100,
        signals: {
          reason: "Reviewer selected this transaction manually.",
        } as Prisma.InputJsonObject,
        confidenceReasons: ["Reviewer selected this transaction manually."] as Prisma.InputJsonArray,
        suggestedBy: "reviewer",
        createdById: userId,
        confirmedById: userId,
        confirmedAt: new Date(),
        reviewedByUserId: userId,
        reviewedAt: new Date(),
        notes,
      },
    });
    createdMatchId = match.id;
    await tx.bankReconciliationMatch.updateMany({
      where: {
        rowId: entry.id,
        id: { not: match.id },
        status: "SUGGESTED",
      },
      data: {
        status: "REJECTED",
        rejectedById: userId,
        rejectedAt: new Date(),
        reviewedByUserId: userId,
        reviewedAt: new Date(),
      },
    });
    await tx.bankStatementImportRow.update({
      where: { id: entry.id },
      data: { status: "MATCHED" },
    });
    await recordReconciliationAction(tx, {
      businessId,
      userId,
      action: "manual_match_created",
      entryId: entry.id,
      matchId: match.id,
      reason: notes,
      metadata: { transactionId },
    });
  });

  await updateImportProgress(entry.importId);
  return getBankReconciliationEntry({ businessId, entryId }).then((updatedEntry) => ({
    entry: updatedEntry,
    matchId: createdMatchId,
  }));
}

export async function unmatchBankReconciliationMatch({
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
    throw new BankReconciliationDomainError("Choose a valid reconciliation match.", 404, "match_not_found");
  }

  assertImportEditable(match.statementImport.status);

  await prisma.$transaction(async (tx) => {
    await tx.bankReconciliationMatch.update({
      where: { id: match.id },
      data: {
        status: "UNMATCHED",
        reviewedByUserId: userId,
        reviewedAt: new Date(),
        notes,
      },
    });
    const suggestedForRow = await tx.bankReconciliationMatch.count({
      where: { rowId: match.rowId, status: "SUGGESTED", transactionId: { not: null } },
    });
    await tx.bankStatementImportRow.update({
      where: { id: match.rowId },
      data: { status: suggestedForRow > 0 ? "SUGGESTED" : "UNMATCHED" },
    });
    await recordReconciliationAction(tx, {
      businessId,
      userId,
      action: "match_unmatched",
      entryId: match.rowId,
      matchId: match.id,
      reason: notes,
      metadata: { transactionId: match.transactionId },
    });
  });

  return updateImportProgress(match.importId);
}

export async function ignoreBankReconciliationEntry({
  businessId,
  userId,
  entryId,
  reason,
}: {
  businessId: string;
  userId: string;
  entryId: string;
  reason?: string;
}) {
  const prisma = getPrisma();
  const entry = await prisma.bankStatementImportRow.findFirst({
    where: { id: entryId, businessId },
    include: { statementImport: true },
  });

  if (!entry) {
    throw new BankReconciliationDomainError("Choose a valid bank statement entry.", 404, "entry_not_found");
  }

  assertImportEditable(entry.statementImport.status);

  if (entry.status === "MATCHED") {
    throw new BankReconciliationDomainError("Unmatch this entry before ignoring it.", 409, "entry_matched");
  }

  await prisma.$transaction(async (tx) => {
    await tx.bankStatementImportRow.update({
      where: { id: entry.id },
      data: { status: "IGNORED" },
    });
    await tx.bankReconciliationMatch.updateMany({
      where: {
        rowId: entry.id,
        status: "SUGGESTED",
      },
      data: {
        status: "REJECTED",
        rejectedById: userId,
        rejectedAt: new Date(),
        reviewedByUserId: userId,
        reviewedAt: new Date(),
      },
    });
    await recordReconciliationAction(tx, {
      businessId,
      userId,
      action: "entry_ignored",
      entryId: entry.id,
      reason,
    });
  });

  return updateImportProgress(entry.importId);
}

export async function reopenBankReconciliationEntry({
  businessId,
  userId,
  entryId,
  reason,
}: {
  businessId: string;
  userId: string;
  entryId: string;
  reason?: string;
}) {
  const prisma = getPrisma();
  const entry = await prisma.bankStatementImportRow.findFirst({
    where: { id: entryId, businessId },
    include: { statementImport: true },
  });

  if (!entry) {
    throw new BankReconciliationDomainError("Choose a valid bank statement entry.", 404, "entry_not_found");
  }

  assertImportEditable(entry.statementImport.status);

  if (entry.status === "MATCHED") {
    throw new BankReconciliationDomainError("Unmatch this entry before reopening it.", 409, "entry_matched");
  }

  await prisma.$transaction(async (tx) => {
    await tx.bankStatementImportRow.update({
      where: { id: entry.id },
      data: {
        status: "UNMATCHED",
        duplicateStatus: entry.duplicateStatus === "UNIQUE" ? "UNIQUE" : "CONFIRMED_DUPLICATE",
      },
    });
    await recordReconciliationAction(tx, {
      businessId,
      userId,
      action: "entry_reopened",
      entryId: entry.id,
      reason,
    });
  });

  return updateImportProgress(entry.importId);
}

export async function lockBankStatementImport({
  businessId,
  userId,
  importId,
}: {
  businessId: string;
  userId?: string;
  importId: string;
}) {
  const prisma = getPrisma();
  const statementImport = await prisma.bankStatementImport.findFirst({
    where: { id: importId, businessId },
  });

  if (!statementImport) {
    throw new BankReconciliationDomainError("Choose a valid bank statement import.", 404, "import_not_found");
  }

  const unresolvedRows = await prisma.bankStatementImportRow.count({
    where: {
      importId,
      status: { in: ["UNMATCHED", "SUGGESTED", "DUPLICATE"] },
    },
  });

  if (unresolvedRows > 0) {
    throw new BankReconciliationDomainError(
      "Review unmatched, duplicate, and suggested rows before locking this reconciliation.",
      409,
      "unresolved_rows",
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.bankStatementImport.update({
      where: { id: importId },
      data: {
        status: "LOCKED",
        lockedAt: new Date(),
      },
    });

    if (userId) {
      await recordReconciliationAction(tx, {
        businessId,
        userId,
        action: "import_locked",
        reason: "Reviewer locked completed reconciliation.",
        metadata: { importId },
      });
    }

    return updated;
  });
}

export async function reopenBankStatementImport({
  businessId,
  userId,
  importId,
}: {
  businessId: string;
  userId?: string;
  importId: string;
}) {
  const prisma = getPrisma();
  const statementImport = await prisma.bankStatementImport.findFirst({
    where: { id: importId, businessId },
  });

  if (!statementImport) {
    throw new BankReconciliationDomainError("Choose a valid bank statement import.", 404, "import_not_found");
  }

  if (statementImport.status !== "LOCKED") {
    throw new BankReconciliationDomainError("Only locked reconciliations can be reopened.", 409, "not_locked");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.bankStatementImport.update({
      where: { id: importId },
      data: {
        status: "REOPENED",
        lockedAt: null,
        reopenedAt: new Date(),
        version: { increment: 1 },
      },
    });

    if (userId) {
      await recordReconciliationAction(tx, {
        businessId,
        userId,
        action: "import_reopened",
        reason: "Reviewer reopened reconciliation.",
        metadata: { importId },
      });
    }

    return updated;
  });
}

export async function exportBankReconciliation({
  businessId,
  userId,
  importId,
  status,
  duplicateStatus,
  query,
  from,
  to,
}: {
  businessId: string;
  userId: string;
  importId?: string;
  status?: BankStatementRowStatus;
  duplicateStatus?: string;
  query?: string;
  from?: Date;
  to?: Date;
}) {
  const prisma = getPrisma();
  const where = buildEntryWhere({
    businessId,
    importId,
    status,
    duplicateStatus,
    query,
    from,
    to,
  });
  const total = await prisma.bankStatementImportRow.count({ where });

  if (total > 5_000) {
    throw new BankReconciliationDomainError(
      "Narrow the reconciliation export before downloading more than 5,000 rows.",
      413,
      "export_too_large",
    );
  }

  const rows = await prisma.bankStatementImportRow.findMany({
    where,
    orderBy: [{ postedAt: "asc" }, { rowNumber: "asc" }],
    include: {
      statementImport: {
        select: {
          id: true,
          fileName: true,
          bankName: true,
          accountLabel: true,
          importedAt: true,
        },
      },
      matches: {
        orderBy: [{ status: "asc" }, { confidence: "desc" }],
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
  });
  const csv = bankReconciliationRowsToCsv(rows as BankReconciliationExportRow[]);
  const filename = bankReconciliationCsvFilename({ importId, from, to });

  await getPrisma().$transaction(async (tx) => {
    await recordReconciliationAction(tx, {
      businessId,
      userId,
      action: "exported",
      reason: "Bank reconciliation CSV exported.",
      metadata: {
        importId: importId ?? null,
        status: status ?? null,
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
        rowCount: rows.length,
      },
    });
  });

  return { csv, filename, rowCount: rows.length };
}

async function validateImportReferences({
  businessId,
  accountId,
  locationId,
  bankProfileId,
}: {
  businessId: string;
  accountId?: string;
  locationId?: string;
  bankProfileId?: string;
}) {
  const prisma = getPrisma();
  const [account, location, bankProfile] = await Promise.all([
    accountId
      ? prisma.account.findFirst({
          where: { id: accountId, businessId },
          select: { id: true },
        })
      : Promise.resolve(null),
    locationId
      ? prisma.businessLocation.findFirst({
          where: { id: locationId, businessId, archivedAt: null },
          select: { id: true },
        })
      : Promise.resolve(null),
    bankProfileId
      ? prisma.bankAccountProfile.findFirst({
          where: { id: bankProfileId, businessId, isActive: true },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  if (accountId && !account) {
    throw new BankReconciliationDomainError("Choose a valid account for reconciliation.", 400, "account_invalid");
  }

  if (locationId && !location) {
    throw new BankReconciliationDomainError("Choose a valid business location.", 400, "location_invalid");
  }

  if (bankProfileId && !bankProfile) {
    throw new BankReconciliationDomainError("Choose a valid bank profile.", 400, "bank_profile_invalid");
  }
}

async function findExistingRowsByFingerprint({
  businessId,
  fingerprints,
}: {
  businessId: string;
  fingerprints: string[];
}) {
  const uniqueFingerprints = [...new Set(fingerprints)];

  if (uniqueFingerprints.length === 0) {
    return new Map<string, { id: string; fingerprint: string; importId: string; rowNumber: number }>();
  }

  const rows = await getPrisma().bankStatementImportRow.findMany({
    where: {
      businessId,
      fingerprint: { in: uniqueFingerprints },
    },
    select: {
      id: true,
      fingerprint: true,
      importId: true,
      rowNumber: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return new Map(rows.map((row) => [row.fingerprint, row]));
}

async function listCandidateTransactions({
  businessId,
  accountId,
  locationId,
  transactionStart,
  transactionEnd,
}: {
  businessId: string;
  accountId?: string;
  locationId?: string;
  transactionStart: Date;
  transactionEnd: Date;
}): Promise<ReconciliationTransaction[]> {
  const transactions = await getPrisma().transaction.findMany({
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
      idempotencyKey: true,
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

  return transactions.map((transaction) => ({
    id: transaction.id,
    idempotencyKey: transaction.idempotencyKey,
    type: transaction.type.toLowerCase(),
    amount: decimalToNumber(transaction.amount),
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
  }));
}

async function listConfirmedTransactionIds({
  businessId,
  exceptRowId,
}: {
  businessId: string;
  exceptRowId?: string;
}) {
  const matches = await getPrisma().bankReconciliationMatch.findMany({
    where: {
      businessId,
      status: "CONFIRMED",
      transactionId: { not: null },
      ...(exceptRowId ? { rowId: { not: exceptRowId } } : {}),
    },
    select: { transactionId: true },
  });

  return new Set(matches.flatMap((match) => match.transactionId ? [match.transactionId] : []));
}

async function assertTransactionNotAlreadyConfirmed({
  businessId,
  transactionId,
  exceptMatchId,
}: {
  businessId: string;
  transactionId: string;
  exceptMatchId?: string;
}) {
  const existing = await getPrisma().bankReconciliationMatch.findFirst({
    where: {
      businessId,
      transactionId,
      status: "CONFIRMED",
      ...(exceptMatchId ? { id: { not: exceptMatchId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw new BankReconciliationDomainError(
      "This transaction is already confirmed against another statement entry.",
      409,
      "transaction_already_matched",
    );
  }
}

function buildEntryWhere({
  businessId,
  importId,
  status,
  duplicateStatus,
  query,
  from,
  to,
}: {
  businessId: string;
  importId?: string;
  status?: BankStatementRowStatus;
  duplicateStatus?: string;
  query?: string;
  from?: Date;
  to?: Date;
}) {
  const where: Prisma.BankStatementImportRowWhereInput = {
    businessId,
    ...(importId ? { importId } : {}),
    ...(status ? { status } : {}),
    ...(duplicateStatus ? { duplicateStatus } : {}),
    ...(from || to ? { postedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(query
      ? {
          OR: [
            { description: { contains: query, mode: "insensitive" } },
            { reference: { contains: query, mode: "insensitive" } },
            { externalReference: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  return where;
}

function entryInclude(actionTake = 5) {
  return {
    statementImport: {
      select: {
        id: true,
        fileName: true,
        bankName: true,
        accountLabel: true,
        importedAt: true,
        status: true,
      },
    },
    matches: {
      orderBy: [{ status: "asc" }, { confidence: "desc" }],
      include: {
        transaction: {
          select: {
            id: true,
            type: true,
            amount: true,
            description: true,
            occurredAt: true,
            accountId: true,
            destinationAccountId: true,
          },
        },
      },
    },
    actions: {
      orderBy: { createdAt: "desc" },
      take: actionTake,
    },
  } satisfies Prisma.BankStatementImportRowInclude;
}

async function updateImportProgress(importId: string) {
  const prisma = getPrisma();
  const [matchedCount, unresolvedRows, statementImport] = await Promise.all([
    prisma.bankReconciliationMatch.count({
      where: { importId, status: "CONFIRMED" },
    }),
    prisma.bankStatementImportRow.count({
      where: { importId, status: { in: ["UNMATCHED", "SUGGESTED", "DUPLICATE"] } },
    }),
    prisma.bankStatementImport.findUnique({
      where: { id: importId },
      select: { status: true },
    }),
  ]);

  return prisma.bankStatementImport.update({
    where: { id: importId },
    data: {
      matchedCount,
      ...(statementImport?.status === "LOCKED"
        ? {}
        : { status: unresolvedRows === 0 ? "REVIEWED" : "IMPORTED" }),
    },
  });
}

async function recordReconciliationAction(
  tx: Prisma.TransactionClient,
  {
    businessId,
    userId,
    action,
    entryId,
    matchId,
    reason,
    metadata,
  }: {
    businessId: string;
    userId: string;
    action: BankReconciliationActionName;
    entryId?: string;
    matchId?: string;
    reason?: string;
    metadata?: Prisma.InputJsonObject;
  },
) {
  await tx.bankReconciliationAction.create({
    data: {
      businessId,
      statementEntryId: entryId,
      matchId,
      action,
      reason,
      performedByUserId: userId,
      metadata,
    },
  });
  await tx.auditLog.create({
    data: {
      businessId,
      actorId: userId,
      action: `bank_reconciliation.${action}`,
      message: bankReconciliationActionMessage(action),
      metadata: {
        feature: "phase3_bank_reconciliation",
        entryId: entryId ?? null,
        matchId: matchId ?? null,
        ...(metadata ?? {}),
      } as Prisma.InputJsonObject,
    },
  });
}

function assertImportEditable(status: string) {
  if (status === "LOCKED") {
    throw new BankReconciliationDomainError(
      "This reconciliation is locked. Reopen it before making changes.",
      409,
      "import_locked",
    );
  }
}

function dbRowToParsed(row: {
  id: string;
  rowNumber: number;
  postedAt: Date;
  valueDate: Date | null;
  amount: Prisma.Decimal;
  direction: string;
  description: string;
  normalizedDescription: string | null;
  reference: string | null;
  externalReference: string | null;
  debitAmount: Prisma.Decimal;
  creditAmount: Prisma.Decimal;
  signedAmount: Prisma.Decimal | null;
  balance: Prisma.Decimal | null;
  fingerprint: string;
  duplicateStatus: string;
  duplicateOfRowId: string | null;
  suggestedCategory: string | null;
  raw: Prisma.JsonValue;
}): ParsedBankStatementRow {
  return {
    id: row.id,
    rowNumber: row.rowNumber,
    postedAt: row.postedAt,
    valueDate: row.valueDate ?? undefined,
    amount: decimalToNumber(row.amount),
    direction: row.direction === "outflow" ? "outflow" : "inflow",
    description: row.description,
    normalizedDescription: row.normalizedDescription ?? "",
    reference: row.reference ?? undefined,
    externalReference: row.externalReference ?? undefined,
    debitAmount: decimalToNumber(row.debitAmount),
    creditAmount: decimalToNumber(row.creditAmount),
    signedAmount: row.signedAmount ? decimalToNumber(row.signedAmount) : 0,
    balance: row.balance ? decimalToNumber(row.balance) : undefined,
    fingerprint: row.fingerprint,
    duplicateStatus: row.duplicateStatus === "CONFIRMED_DUPLICATE"
      ? "CONFIRMED_DUPLICATE"
      : row.duplicateStatus === "PROBABLE_DUPLICATE"
        ? "PROBABLE_DUPLICATE"
        : "UNIQUE",
    duplicateOfRowId: row.duplicateOfRowId ?? undefined,
    suggestedCategory: row.suggestedCategory ?? undefined,
    raw: typeof row.raw === "object" && row.raw && !Array.isArray(row.raw)
      ? row.raw as Record<string, string>
      : {},
  };
}

function decimalToNumber(value: Prisma.Decimal | number) {
  return typeof value === "number" ? value : value.toNumber();
}

function bankReconciliationActionMessage(action: BankReconciliationActionName) {
  switch (action) {
    case "import_previewed":
      return "Bank statement import previewed.";
    case "import_created":
      return "Bank statement imported for reconciliation.";
    case "match_suggested":
      return "Bank reconciliation match suggested.";
    case "match_confirmed":
      return "Bank reconciliation match confirmed.";
    case "match_rejected":
      return "Bank reconciliation match rejected.";
    case "manual_match_created":
      return "Manual bank reconciliation match created.";
    case "match_unmatched":
      return "Bank reconciliation match removed.";
    case "entry_ignored":
      return "Bank statement entry ignored.";
    case "entry_reopened":
      return "Bank statement entry reopened.";
    case "import_locked":
      return "Bank reconciliation locked.";
    case "import_reopened":
      return "Bank reconciliation reopened.";
    case "exported":
      return "Bank reconciliation exported.";
  }
}
