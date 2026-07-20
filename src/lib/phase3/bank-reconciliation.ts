import { createHash } from "node:crypto";

export const bankReconciliationSnapshotVersion = "bank-reconciliation-v1";

export type BankStatementDirection = "inflow" | "outflow";
export type BankStatementRowStatus = "UNMATCHED" | "SUGGESTED" | "MATCHED" | "DUPLICATE" | "IGNORED";

export type ParsedBankStatementRow = {
  id?: string;
  rowNumber: number;
  postedAt: Date;
  amount: number;
  direction: BankStatementDirection;
  description: string;
  reference?: string;
  balance?: number;
  fingerprint: string;
  duplicateOfRowNumber?: number;
  duplicateOfRowId?: string;
  suggestedCategory?: string;
  raw: Record<string, string>;
};

export type BankStatementParseResult = {
  rows: ParsedBankStatementRow[];
  errors: Array<{ rowNumber: number; message: string }>;
  warnings: string[];
  statementStart?: Date;
  statementEnd?: Date;
  duplicateRowCount: number;
};

export type ReconciliationTransaction = {
  id: string;
  type: string;
  amount: number;
  paymentStatus?: string | null;
  occurredAt: Date;
  description: string;
  category?: string | null;
  accountId?: string | null;
  destinationAccountId?: string | null;
  customerName?: string | null;
  supplierName?: string | null;
  reversed?: boolean;
  isReversal?: boolean;
};

export type BankReconciliationSuggestion = {
  rowId?: string;
  rowNumber: number;
  transactionId?: string;
  matchType: "exact" | "likely" | "possible_transfer" | "missing_record" | "duplicate";
  status: "SUGGESTED" | "DUPLICATE";
  confidence: number;
  signals: {
    amountMatches?: boolean;
    dateDistanceDays?: number;
    directionMatches?: boolean;
    accountMatches?: boolean;
    descriptionOverlap?: number;
    paymentStatus?: string;
    transactionType?: string;
    suggestedCategory?: string;
    duplicateOfRowNumber?: number;
    reason?: string;
  };
};

const dateHeaders = ["date", "posted at", "posted_at", "transaction date", "value date"];
const descriptionHeaders = ["description", "narration", "details", "memo", "particulars"];
const amountHeaders = ["amount", "transaction amount", "value"];
const debitHeaders = ["debit", "withdrawal", "money out", "outflow"];
const creditHeaders = ["credit", "deposit", "money in", "inflow"];
const referenceHeaders = ["reference", "ref", "transaction reference", "session id"];
const balanceHeaders = ["balance", "running balance", "closing balance"];

export function parseBankStatementCsv(csv: string): BankStatementParseResult {
  const table = parseCsvTable(csv);
  const warnings: string[] = [];

  if (table.length < 2) {
    return {
      rows: [],
      errors: [{ rowNumber: 1, message: "CSV must include a header row and at least one statement row." }],
      warnings,
      duplicateRowCount: 0,
    };
  }

  const headers = table[0].map((header) => normalizeHeader(header));
  const indexes = {
    date: findHeader(headers, dateHeaders),
    description: findHeader(headers, descriptionHeaders),
    amount: findHeader(headers, amountHeaders),
    debit: findHeader(headers, debitHeaders),
    credit: findHeader(headers, creditHeaders),
    reference: findHeader(headers, referenceHeaders),
    balance: findHeader(headers, balanceHeaders),
  };
  const headerErrors = validateHeaders(indexes);

  if (headerErrors.length > 0) {
    return {
      rows: [],
      errors: headerErrors.map((message) => ({ rowNumber: 1, message })),
      warnings,
      duplicateRowCount: 0,
    };
  }

  const errors: BankStatementParseResult["errors"] = [];
  const rows: ParsedBankStatementRow[] = [];
  const fingerprintRows = new Map<string, number>();

  table.slice(1).forEach((columns, index) => {
    const rowNumber = index + 2;
    const raw = Object.fromEntries(headers.map((header, columnIndex) => [header, columns[columnIndex]?.trim() ?? ""]));
    const postedAt = parseFlexibleDate(columns[indexes.date]?.trim() ?? "");
    const description = (columns[indexes.description]?.trim() || "Bank transaction").slice(0, 500);
    const reference = indexes.reference >= 0 ? columns[indexes.reference]?.trim() || undefined : undefined;
    const balance = indexes.balance >= 0 ? parseMoney(columns[indexes.balance]) : undefined;
    const amountParts = resolveAmountParts(columns, indexes);

    if (!postedAt) {
      errors.push({ rowNumber, message: "Could not read transaction date." });
      return;
    }

    if (!amountParts || amountParts.amount <= 0) {
      errors.push({ rowNumber, message: "Could not read transaction amount." });
      return;
    }

    const fingerprint = buildRowFingerprint({
      postedAt,
      amount: amountParts.amount,
      direction: amountParts.direction,
      description,
      reference,
    });
    const duplicateOfRowNumber = fingerprintRows.get(fingerprint);

    if (!duplicateOfRowNumber) {
      fingerprintRows.set(fingerprint, rowNumber);
    }

    rows.push({
      rowNumber,
      postedAt,
      amount: amountParts.amount,
      direction: amountParts.direction,
      description,
      reference,
      balance,
      fingerprint,
      duplicateOfRowNumber,
      suggestedCategory: suggestCategory(description),
      raw,
    });
  });

  const dates = rows.map((row) => row.postedAt).sort((left, right) => left.getTime() - right.getTime());

  if (rows.length > 0 && errors.length > 0) {
    warnings.push("Some rows were skipped because they could not be normalized.");
  }

  return {
    rows,
    errors,
    warnings,
    statementStart: dates[0],
    statementEnd: dates[dates.length - 1],
    duplicateRowCount: rows.filter((row) => row.duplicateOfRowNumber).length,
  };
}

export function suggestBankReconciliationMatches({
  rows,
  transactions,
  accountId,
}: {
  rows: ParsedBankStatementRow[];
  transactions: ReconciliationTransaction[];
  accountId?: string;
}): BankReconciliationSuggestion[] {
  const activeTransactions = transactions.filter(
    (transaction) =>
      !transaction.reversed &&
      !transaction.isReversal &&
      normalize(transaction.paymentStatus) === "paid" &&
      normalize(transaction.type) !== "adjustment",
  );

  return rows.map((row) => {
    if (row.duplicateOfRowNumber || row.duplicateOfRowId) {
      return {
        rowId: row.id,
        rowNumber: row.rowNumber,
        matchType: "duplicate",
        status: "DUPLICATE",
        confidence: 100,
        signals: {
          duplicateOfRowNumber: row.duplicateOfRowNumber,
          reason: "This statement row has the same date, amount, direction, description, and reference as another row.",
        },
      };
    }

    const candidates = activeTransactions
      .map((transaction) => scoreTransactionMatch(row, transaction, accountId))
      .filter((candidate) => candidate.confidence >= 50)
      .sort((left, right) => right.confidence - left.confidence);
    const best = candidates[0];

    if (!best) {
      return {
        rowId: row.id,
        rowNumber: row.rowNumber,
        matchType: "missing_record",
        status: "SUGGESTED",
        confidence: 0,
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
      matchType: normalize(best.transaction.type) === "transfer"
        ? "possible_transfer"
        : best.confidence >= 85
          ? "exact"
          : "likely",
      status: "SUGGESTED",
      confidence: best.confidence,
      signals: best.signals,
    };
  });
}

export function buildBankStatementFileHash(csv: string) {
  return createHash("sha256").update(csv.trim()).digest("hex");
}

function validateHeaders(indexes: {
  date: number;
  description: number;
  amount: number;
  debit: number;
  credit: number;
}) {
  const errors: string[] = [];

  if (indexes.date < 0) {
    errors.push("CSV must include a date column.");
  }

  if (indexes.description < 0) {
    errors.push("CSV must include a description, narration, or details column.");
  }

  if (indexes.amount < 0 && indexes.debit < 0 && indexes.credit < 0) {
    errors.push("CSV must include either an amount column or debit/credit columns.");
  }

  return errors;
}

function resolveAmountParts(
  columns: string[],
  indexes: { amount: number; debit: number; credit: number },
): { amount: number; direction: BankStatementDirection } | null {
  const debit = indexes.debit >= 0 ? parseMoney(columns[indexes.debit]) : undefined;
  const credit = indexes.credit >= 0 ? parseMoney(columns[indexes.credit]) : undefined;

  if (debit && debit > 0) {
    return { amount: roundMoney(debit), direction: "outflow" };
  }

  if (credit && credit > 0) {
    return { amount: roundMoney(credit), direction: "inflow" };
  }

  if (indexes.amount >= 0) {
    const signedAmount = parseMoney(columns[indexes.amount], true);

    if (signedAmount === undefined || signedAmount === 0) {
      return null;
    }

    return {
      amount: roundMoney(Math.abs(signedAmount)),
      direction: signedAmount < 0 ? "outflow" : "inflow",
    };
  }

  return null;
}

function scoreTransactionMatch(
  row: ParsedBankStatementRow,
  transaction: ReconciliationTransaction,
  accountId?: string,
) {
  const amountMatches = Math.abs(cleanAmount(transaction.amount) - row.amount) <= 0.01;
  const dateDistanceDays = Math.abs(daysBetween(row.postedAt, transaction.occurredAt));
  const directionMatches = row.direction === transactionDirection(transaction, accountId);
  const accountMatches = accountId
    ? transaction.accountId === accountId || transaction.destinationAccountId === accountId
    : false;
  const descriptionOverlap = calculateDescriptionOverlap(row.description, [
    transaction.description,
    transaction.category,
    transaction.customerName,
    transaction.supplierName,
  ]);
  let confidence = 0;

  if (amountMatches) {
    confidence += 45;
  }

  if (dateDistanceDays <= 3) {
    confidence += Math.max(0, 25 - dateDistanceDays * 6);
  }

  if (directionMatches) {
    confidence += 15;
  }

  confidence += Math.round(descriptionOverlap * 10);

  if (accountMatches) {
    confidence += 5;
  }

  if (!amountMatches || dateDistanceDays > 3 || !directionMatches) {
    confidence = Math.min(confidence, 74);
  }

  return {
    transaction,
    confidence: Math.min(100, confidence),
    signals: {
      amountMatches,
      dateDistanceDays,
      directionMatches,
      accountMatches,
      descriptionOverlap,
      paymentStatus: normalize(transaction.paymentStatus),
      transactionType: normalize(transaction.type),
      suggestedCategory: row.suggestedCategory,
    },
  };
}

function transactionDirection(transaction: ReconciliationTransaction, accountId?: string): BankStatementDirection | null {
  const type = normalize(transaction.type);

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

function suggestCategory(description: string) {
  const text = description.toLowerCase();

  if (/\b(pos|card|terminal|settlement)\b/.test(text)) {
    return "POS/Card settlement";
  }

  if (/\b(transfer|trf|wallet|bank)\b/.test(text)) {
    return "Bank transfer";
  }

  if (/\b(salary|wage|payroll)\b/.test(text)) {
    return "Payroll";
  }

  if (/\b(rent|lease)\b/.test(text)) {
    return "Rent";
  }

  if (/\b(data|airtime|internet|electric|power|utility)\b/.test(text)) {
    return "Utilities";
  }

  if (/\b(supplier|vendor|wholesale)\b/.test(text)) {
    return "Supplier payment";
  }

  return undefined;
}

function buildRowFingerprint(input: {
  postedAt: Date;
  amount: number;
  direction: BankStatementDirection;
  description: string;
  reference?: string;
}) {
  const source = [
    input.postedAt.toISOString().slice(0, 10),
    input.amount.toFixed(2),
    input.direction,
    normalizeText(input.description).slice(0, 120),
    normalizeText(input.reference ?? ""),
  ].join("|");

  return createHash("sha256").update(source).digest("hex");
}

function parseCsvTable(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === "\"" && inQuotes && next === "\"") {
      cell += "\"";
      index += 1;
      continue;
    }

    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }

      row.push(cell);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

function parseFlexibleDate(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    return new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
  }

  const dayFirstMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (dayFirstMatch) {
    const first = Number(dayFirstMatch[1]);
    const second = Number(dayFirstMatch[2]);
    const year = normalizeYear(Number(dayFirstMatch[3]));
    const day = first > 12 || second <= 12 ? first : second;
    const month = first > 12 || second <= 12 ? second : first;
    return new Date(Date.UTC(year, month - 1, day));
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseMoney(value: string | undefined, allowSigned = false) {
  if (!value?.trim()) {
    return undefined;
  }

  const trimmed = value.trim();
  const negativeByParentheses = /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed.replace(/[^\d.-]/g, "");
  const parsed = Number.parseFloat(cleaned);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  if (allowSigned) {
    return negativeByParentheses ? -Math.abs(parsed) : parsed;
  }

  return Math.abs(parsed);
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

function findHeader(headers: string[], candidates: string[]) {
  return headers.findIndex((header) => candidates.includes(header));
}

function normalizeHeader(value: string) {
  return normalizeText(value).replaceAll("_", " ");
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function normalizeYear(year: number) {
  return year < 100 ? 2000 + year : year;
}

function normalize(value?: string | null) {
  return (value ?? "").toLowerCase();
}

function cleanAmount(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function daysBetween(left: Date, right: Date) {
  return Math.ceil(Math.abs(right.getTime() - left.getTime()) / 86_400_000);
}
