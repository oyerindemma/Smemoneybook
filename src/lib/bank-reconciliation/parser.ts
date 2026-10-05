import {
  type BankStatementColumnMapping,
  type BankStatementDirection,
  type BankStatementParseResult,
  type BankStatementPreview,
  type ParsedBankStatementRow,
} from "@/lib/bank-reconciliation/definitions";
import {
  buildBankStatementRowFingerprint,
  normalizeDescription,
  normalizeHeader,
  parseFlexibleDate,
  parseMoney,
  roundMoney,
} from "@/lib/bank-reconciliation/normalizer";

const dateHeaders = ["date", "posted at", "posted date", "transaction date", "trans date", "posting date"];
const valueDateHeaders = ["value date", "effective date"];
const descriptionHeaders = ["description", "narration", "details", "memo", "particulars", "transaction details"];
const amountHeaders = ["amount", "transaction amount", "value"];
const debitHeaders = ["debit", "withdrawal", "money out", "outflow", "debits"];
const creditHeaders = ["credit", "deposit", "money in", "inflow", "credits"];
const referenceHeaders = ["reference", "ref", "transaction reference", "session id", "rrn"];
const externalReferenceHeaders = ["external reference", "bank reference", "instrument number", "cheque number"];
const balanceHeaders = ["balance", "running balance", "closing balance", "available balance"];

type ColumnIndexes = {
  postedAt: number;
  valueDate: number;
  description: number;
  amount: number;
  debit: number;
  credit: number;
  reference: number;
  externalReference: number;
  balance: number;
};

export function parseBankStatementCsv(
  csv: string,
  mapping: BankStatementColumnMapping = {},
): BankStatementParseResult {
  const table = parseCsvTable(csv);
  const warnings: string[] = [];

  if (table.length < 2) {
    return {
      headers: [],
      mapping: emptyResolvedMapping(),
      rows: [],
      errors: [{ rowNumber: 1, message: "CSV must include a header row and at least one statement row." }],
      warnings,
      duplicateRowCount: 0,
      totals: { inflow: 0, outflow: 0, net: 0 },
    };
  }

  const headers = table[0].map((header, index) => header.trim() || `Column ${index + 1}`);
  const normalizedHeaders = headers.map((header) => normalizeHeader(header));
  const indexes = resolveIndexes(headers, normalizedHeaders, mapping);
  const headerErrors = validateHeaders(indexes);
  const resolvedMapping = resolveMapping(headers, indexes);

  if (headerErrors.length > 0) {
    return {
      headers,
      mapping: resolvedMapping,
      rows: [],
      errors: headerErrors.map((message) => ({ rowNumber: 1, message })),
      warnings,
      duplicateRowCount: 0,
      totals: { inflow: 0, outflow: 0, net: 0 },
    };
  }

  const errors: BankStatementParseResult["errors"] = [];
  const rows: ParsedBankStatementRow[] = [];
  const fingerprintRows = new Map<string, number>();

  table.slice(1).forEach((columns, index) => {
    const rowNumber = index + 2;
    const raw = Object.fromEntries(
      headers.map((header, columnIndex) => [header, columns[columnIndex]?.trim() ?? ""]),
    );
    const postedAt = parseFlexibleDate(columns[indexes.postedAt]?.trim() ?? "");
    const valueDate = indexes.valueDate >= 0
      ? parseFlexibleDate(columns[indexes.valueDate]?.trim() ?? "")
      : null;
    const description = (columns[indexes.description]?.trim() || "Bank transaction").slice(0, 500);
    const normalizedDescription = normalizeDescription(description);
    const reference = indexes.reference >= 0 ? columns[indexes.reference]?.trim() || undefined : undefined;
    const externalReference = indexes.externalReference >= 0
      ? columns[indexes.externalReference]?.trim() || undefined
      : undefined;
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

    const fingerprint = buildBankStatementRowFingerprint({
      postedAt,
      amount: amountParts.amount,
      direction: amountParts.direction,
      description,
      reference,
      externalReference,
    });
    const duplicateOfRowNumber = fingerprintRows.get(fingerprint);

    if (!duplicateOfRowNumber) {
      fingerprintRows.set(fingerprint, rowNumber);
    }

    rows.push({
      rowNumber,
      postedAt,
      valueDate: valueDate ?? undefined,
      amount: amountParts.amount,
      direction: amountParts.direction,
      description,
      normalizedDescription,
      reference,
      externalReference,
      debitAmount: amountParts.debitAmount,
      creditAmount: amountParts.creditAmount,
      signedAmount: amountParts.signedAmount,
      balance,
      fingerprint,
      duplicateStatus: duplicateOfRowNumber ? "PROBABLE_DUPLICATE" : "UNIQUE",
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
    headers,
    mapping: resolvedMapping,
    rows,
    errors,
    warnings,
    statementStart: dates[0],
    statementEnd: dates[dates.length - 1],
    duplicateRowCount: rows.filter((row) => row.duplicateOfRowNumber).length,
    totals: rows.reduce(
      (totals, row) => {
        if (row.direction === "inflow") {
          totals.inflow = roundMoney(totals.inflow + row.amount);
        } else {
          totals.outflow = roundMoney(totals.outflow + row.amount);
        }
        totals.net = roundMoney(totals.inflow - totals.outflow);
        return totals;
      },
      { inflow: 0, outflow: 0, net: 0 },
    ),
  };
}

export function previewParsedBankStatement(
  parsed: BankStatementParseResult,
  crossImportDuplicateCount = 0,
): BankStatementPreview {
  return {
    headers: parsed.headers,
    mapping: parsed.mapping,
    rowCount: parsed.rows.length,
    previewRows: parsed.rows.slice(0, 25).map((row) => ({
      ...row,
      postedAt: row.postedAt.toISOString(),
      valueDate: row.valueDate?.toISOString(),
    })),
    errors: parsed.errors.slice(0, 25),
    warnings: parsed.warnings,
    statementStart: parsed.statementStart?.toISOString(),
    statementEnd: parsed.statementEnd?.toISOString(),
    duplicateRowCount: parsed.duplicateRowCount,
    crossImportDuplicateCount,
    totals: parsed.totals,
  };
}

export function parseCsvTable(csv: string) {
  const delimiter = detectDelimiter(csv);
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

    if (char === delimiter && !inQuotes) {
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

function detectDelimiter(csv: string) {
  const header = csv.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t"] as const;
  const counts = candidates.map((candidate) => ({
    delimiter: candidate,
    count: countOutsideQuotes(header, candidate),
  }));
  return counts.sort((left, right) => right.count - left.count)[0]?.delimiter ?? ",";
}

function countOutsideQuotes(value: string, delimiter: string) {
  let count = 0;
  let inQuotes = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];

    if (char === "\"" && inQuotes && next === "\"") {
      index += 1;
      continue;
    }

    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      count += 1;
    }
  }

  return count;
}

function resolveIndexes(
  headers: string[],
  normalizedHeaders: string[],
  mapping: BankStatementColumnMapping,
): ColumnIndexes {
  return {
    postedAt: resolveIndex(headers, normalizedHeaders, mapping.postedAt, dateHeaders),
    valueDate: resolveIndex(headers, normalizedHeaders, mapping.valueDate, valueDateHeaders),
    description: resolveIndex(headers, normalizedHeaders, mapping.description, descriptionHeaders),
    amount: resolveIndex(headers, normalizedHeaders, mapping.amount, amountHeaders),
    debit: resolveIndex(headers, normalizedHeaders, mapping.debit, debitHeaders),
    credit: resolveIndex(headers, normalizedHeaders, mapping.credit, creditHeaders),
    reference: resolveIndex(headers, normalizedHeaders, mapping.reference, referenceHeaders),
    externalReference: resolveIndex(
      headers,
      normalizedHeaders,
      mapping.externalReference,
      externalReferenceHeaders,
    ),
    balance: resolveIndex(headers, normalizedHeaders, mapping.balance, balanceHeaders),
  };
}

function resolveIndex(
  headers: string[],
  normalizedHeaders: string[],
  mappedHeader: string | undefined,
  candidates: string[],
) {
  if (mappedHeader) {
    const normalizedMappedHeader = normalizeHeader(mappedHeader);
    const exact = headers.findIndex((header) => header === mappedHeader);

    if (exact >= 0) {
      return exact;
    }

    const normalized = normalizedHeaders.findIndex((header) => header === normalizedMappedHeader);

    if (normalized >= 0) {
      return normalized;
    }
  }

  return normalizedHeaders.findIndex((header) => candidates.includes(header));
}

function resolveMapping(headers: string[], indexes: ColumnIndexes): Required<BankStatementColumnMapping> {
  return {
    postedAt: headerAt(headers, indexes.postedAt),
    valueDate: headerAt(headers, indexes.valueDate),
    description: headerAt(headers, indexes.description),
    amount: headerAt(headers, indexes.amount),
    debit: headerAt(headers, indexes.debit),
    credit: headerAt(headers, indexes.credit),
    reference: headerAt(headers, indexes.reference),
    externalReference: headerAt(headers, indexes.externalReference),
    balance: headerAt(headers, indexes.balance),
  };
}

function emptyResolvedMapping(): Required<BankStatementColumnMapping> {
  return {
    postedAt: "",
    valueDate: "",
    description: "",
    amount: "",
    debit: "",
    credit: "",
    reference: "",
    externalReference: "",
    balance: "",
  };
}

function headerAt(headers: string[], index: number) {
  return index >= 0 ? headers[index] ?? "" : "";
}

function validateHeaders(indexes: ColumnIndexes) {
  const errors: string[] = [];

  if (indexes.postedAt < 0) {
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
  indexes: Pick<ColumnIndexes, "amount" | "debit" | "credit">,
): {
  amount: number;
  direction: BankStatementDirection;
  debitAmount: number;
  creditAmount: number;
  signedAmount: number;
} | null {
  const debit = indexes.debit >= 0 ? parseMoney(columns[indexes.debit]) : undefined;
  const credit = indexes.credit >= 0 ? parseMoney(columns[indexes.credit]) : undefined;

  if (debit && debit > 0) {
    return {
      amount: roundMoney(debit),
      direction: "outflow",
      debitAmount: roundMoney(debit),
      creditAmount: 0,
      signedAmount: roundMoney(-Math.abs(debit)),
    };
  }

  if (credit && credit > 0) {
    return {
      amount: roundMoney(credit),
      direction: "inflow",
      debitAmount: 0,
      creditAmount: roundMoney(credit),
      signedAmount: roundMoney(credit),
    };
  }

  if (indexes.amount >= 0) {
    const signedAmount = parseMoney(columns[indexes.amount], true);

    if (signedAmount === undefined || signedAmount === 0) {
      return null;
    }

    return {
      amount: roundMoney(Math.abs(signedAmount)),
      direction: signedAmount < 0 ? "outflow" : "inflow",
      debitAmount: signedAmount < 0 ? roundMoney(Math.abs(signedAmount)) : 0,
      creditAmount: signedAmount > 0 ? roundMoney(signedAmount) : 0,
      signedAmount: roundMoney(signedAmount),
    };
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
