import {
  type BankReconciliationMatchType,
  type BankReconciliationSuggestion,
  type ParsedBankStatementRow,
  type ReconciliationTransaction,
} from "@/lib/bank-reconciliation/definitions";
import { daysBetween, normalizeText, roundMoney } from "@/lib/bank-reconciliation/normalizer";

export function suggestBankReconciliationMatches({
  rows,
  transactions,
  accountId,
  excludedTransactionIds = new Set<string>(),
}: {
  rows: ParsedBankStatementRow[];
  transactions: ReconciliationTransaction[];
  accountId?: string;
  excludedTransactionIds?: Set<string>;
}): BankReconciliationSuggestion[] {
  const activeTransactions = transactions.filter(
    (transaction) =>
      !excludedTransactionIds.has(transaction.id) &&
      !transaction.reversed &&
      !transaction.isReversal &&
      normalizeText(transaction.paymentStatus ?? "") === "paid" &&
      normalizeText(transaction.type) !== "adjustment",
  );

  return rows.map((row) => {
    if (row.duplicateOfRowNumber || row.duplicateOfRowId || row.duplicateStatus !== "UNIQUE") {
      return {
        rowId: row.id,
        rowNumber: row.rowNumber,
        matchType: "duplicate",
        status: "DUPLICATE",
        confidence: 100,
        confidenceReasons: [
          "Duplicate fingerprint matched another statement entry.",
          "No accounting transaction was changed.",
        ],
        signals: {
          duplicateOfRowNumber: row.duplicateOfRowNumber,
          duplicateOfRowId: row.duplicateOfRowId,
          reason: "This statement row has the same date, amount, direction, description, and reference as another row.",
        },
      };
    }

    const candidates = activeTransactions
      .map((transaction) => scoreTransactionMatch(row, transaction, accountId))
      .filter((candidate) => candidate.confidence >= 55)
      .sort((left, right) => right.confidence - left.confidence || left.transaction.id.localeCompare(right.transaction.id));
    const best = candidates[0];

    if (!best) {
      return {
        rowId: row.id,
        rowNumber: row.rowNumber,
        matchType: "missing_record",
        status: "SUGGESTED",
        confidence: 0,
        confidenceReasons: [
          "No paid SME MoneyBook transaction matched this statement amount, date, and direction.",
          "Review whether the business record is missing.",
        ],
        signals: {
          suggestedCategory: row.suggestedCategory,
          reason: "No recorded SME MoneyBook transaction matched this bank statement row.",
        },
      };
    }

    return {
      rowId: row.id,
      rowNumber: row.rowNumber,
      transactionId: best.transaction.id,
      matchType: best.matchType,
      status: "SUGGESTED",
      confidence: best.confidence,
      confidenceReasons: best.reasons,
      signals: best.signals,
    };
  });
}

export function scoreTransactionMatch(
  row: ParsedBankStatementRow,
  transaction: ReconciliationTransaction,
  accountId?: string,
) {
  const amountMatches = Math.abs(roundMoney(transaction.amount) - row.amount) <= 0.01;
  const dateDistanceDays = Math.abs(daysBetween(row.postedAt, transaction.occurredAt));
  const directionMatches = row.direction === transactionDirection(transaction, accountId);
  const accountMatches = accountId
    ? transaction.accountId === accountId || transaction.destinationAccountId === accountId
    : false;
  const referenceMatches = referenceMatchesTransaction(row, transaction);
  const descriptionOverlap = calculateDescriptionOverlap(row.description, [
    transaction.description,
    transaction.category,
    transaction.customerName,
    transaction.supplierName,
  ]);
  const reasons: string[] = [];
  let confidence = 0;

  if (amountMatches) {
    confidence += 45;
    reasons.push("Amount matches exactly.");
  }

  if (dateDistanceDays === 0) {
    confidence += 25;
    reasons.push("Transaction date matches statement date.");
  } else if (dateDistanceDays <= 3) {
    confidence += Math.max(8, 24 - dateDistanceDays * 5);
    reasons.push(`Transaction date is within ${dateDistanceDays} day${dateDistanceDays === 1 ? "" : "s"}.`);
  }

  if (directionMatches) {
    confidence += 15;
    reasons.push("Money direction matches the transaction type.");
  }

  if (referenceMatches) {
    confidence += 18;
    reasons.push("Reference appears in the transaction record.");
  }

  if (descriptionOverlap >= 0.5) {
    confidence += 12;
    reasons.push("Description strongly overlaps with the transaction.");
  } else if (descriptionOverlap >= 0.25) {
    confidence += 7;
    reasons.push("Description partially overlaps with the transaction.");
  }

  if (accountMatches) {
    confidence += 5;
    reasons.push("Selected account matches the transaction account.");
  }

  if (!amountMatches) {
    confidence = Math.min(confidence, 54);
  } else if (!directionMatches || dateDistanceDays > 3) {
    confidence = Math.min(confidence, 74);
  }

  const matchType = resolveMatchType({
    amountMatches,
    dateDistanceDays,
    referenceMatches,
    descriptionOverlap,
    confidence,
  });

  return {
    transaction,
    confidence: Math.min(100, confidence),
    matchType,
    reasons,
    signals: {
      amountMatches,
      dateDistanceDays,
      directionMatches,
      accountMatches,
      referenceMatches,
      descriptionOverlap,
      paymentStatus: normalizeText(transaction.paymentStatus ?? ""),
      transactionType: normalizeText(transaction.type),
      suggestedCategory: row.suggestedCategory,
    },
  };
}

function resolveMatchType({
  amountMatches,
  dateDistanceDays,
  referenceMatches,
  descriptionOverlap,
  confidence,
}: {
  amountMatches: boolean;
  dateDistanceDays: number;
  referenceMatches: boolean;
  descriptionOverlap: number;
  confidence: number;
}): BankReconciliationMatchType {
  if (amountMatches && dateDistanceDays === 0 && (referenceMatches || descriptionOverlap >= 0.5)) {
    return "exact";
  }

  if (referenceMatches && amountMatches) {
    return "reference_based";
  }

  if (amountMatches && dateDistanceDays > 0 && dateDistanceDays <= 3) {
    return "date_tolerant";
  }

  if (amountMatches && descriptionOverlap >= 0.25) {
    return "description_based";
  }

  if (amountMatches && confidence >= 55) {
    return "amount_only";
  }

  return "missing_record";
}

function transactionDirection(
  transaction: ReconciliationTransaction,
  accountId?: string,
) {
  const type = normalizeText(transaction.type);

  if (type === "sale") {
    return "inflow";
  }

  if (type === "expense") {
    return "outflow";
  }

  if (type === "transfer") {
    if (accountId && transaction.destinationAccountId === accountId) {
      return "inflow";
    }

    return "outflow";
  }

  return null;
}

function referenceMatchesTransaction(row: ParsedBankStatementRow, transaction: ReconciliationTransaction) {
  const references = [row.reference, row.externalReference]
    .map((reference) => normalizeText(reference ?? ""))
    .filter((reference) => reference.length >= 4);

  if (references.length === 0) {
    return false;
  }

  const transactionText = normalizeText([
    transaction.id,
    transaction.idempotencyKey,
    transaction.description,
    transaction.customerName,
    transaction.supplierName,
  ].filter(Boolean).join(" "));

  return references.some((reference) => transactionText.includes(reference));
}

function calculateDescriptionOverlap(source: string, targets: Array<string | null | undefined>) {
  const sourceTokens = new Set(tokenize(source));
  const targetTokens = new Set(targets.flatMap((target) => tokenize(target ?? "")));

  if (sourceTokens.size === 0 || targetTokens.size === 0) {
    return 0;
  }

  const matches = [...sourceTokens].filter((token) => targetTokens.has(token)).length;
  return Math.round((matches / sourceTokens.size) * 100) / 100;
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 3);
}
