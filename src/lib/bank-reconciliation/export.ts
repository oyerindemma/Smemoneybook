type ExportMatch = {
  id: string;
  status: string;
  matchType: string;
  confidence: number;
  transactionId: string | null;
  transaction?: {
    type: string;
    amount: { toString(): string } | number;
    description: string;
    occurredAt: Date;
  } | null;
};

export type BankReconciliationExportRow = {
  id: string;
  rowNumber: number;
  postedAt: Date;
  valueDate: Date | null;
  description: string;
  reference: string | null;
  externalReference: string | null;
  direction: string;
  amount: { toString(): string } | number;
  debitAmount: { toString(): string } | number;
  creditAmount: { toString(): string } | number;
  balance: { toString(): string } | number | null;
  duplicateStatus: string;
  status: string;
  suggestedCategory: string | null;
  statementImport: {
    id: string;
    fileName: string | null;
    bankName: string | null;
    accountLabel: string | null;
    importedAt: Date;
  };
  matches: ExportMatch[];
};

const headers = [
  "import_id",
  "file_name",
  "bank_name",
  "account_label",
  "imported_at",
  "entry_id",
  "row_number",
  "posted_at",
  "value_date",
  "description",
  "reference",
  "external_reference",
  "direction",
  "amount",
  "debit",
  "credit",
  "balance",
  "entry_status",
  "duplicate_status",
  "suggested_category",
  "match_id",
  "match_status",
  "match_type",
  "confidence",
  "transaction_id",
  "transaction_date",
  "transaction_type",
  "transaction_amount",
  "transaction_description",
];

export function bankReconciliationRowsToCsv(rows: BankReconciliationExportRow[]) {
  const lines = [headers.join(",")];

  for (const row of rows) {
    const match = row.matches.find((candidate) => candidate.status === "CONFIRMED")
      ?? row.matches.find((candidate) => candidate.status === "SUGGESTED")
      ?? row.matches[0]
      ?? null;

    lines.push([
      row.statementImport.id,
      row.statementImport.fileName ?? "",
      row.statementImport.bankName ?? "",
      row.statementImport.accountLabel ?? "",
      row.statementImport.importedAt.toISOString(),
      row.id,
      String(row.rowNumber),
      row.postedAt.toISOString(),
      row.valueDate?.toISOString() ?? "",
      row.description,
      row.reference ?? "",
      row.externalReference ?? "",
      row.direction,
      money(row.amount),
      money(row.debitAmount),
      money(row.creditAmount),
      row.balance === null ? "" : money(row.balance),
      row.status,
      row.duplicateStatus,
      row.suggestedCategory ?? "",
      match?.id ?? "",
      match?.status ?? "",
      match?.matchType ?? "",
      match ? String(match.confidence) : "",
      match?.transactionId ?? "",
      match?.transaction?.occurredAt.toISOString() ?? "",
      match?.transaction?.type ?? "",
      match?.transaction ? money(match.transaction.amount) : "",
      match?.transaction?.description ?? "",
    ].map(csvCell).join(","));
  }

  return `${lines.join("\n")}\n`;
}

export function bankReconciliationCsvFilename({
  from,
  to,
  importId,
}: {
  from?: Date;
  to?: Date;
  importId?: string;
}) {
  const suffix = importId
    ? importId.slice(0, 8)
    : `${toDatePart(from ?? new Date())}_${toDatePart(to ?? new Date())}`;
  return `bank-reconciliation-${suffix}.csv`;
}

function money(value: { toString(): string } | number) {
  return Number(value.toString()).toFixed(2);
}

function toDatePart(date: Date) {
  return date.toISOString().slice(0, 10);
}

function csvCell(value: string) {
  const safeValue = /^[=+\-@]/.test(value.trim()) ? `'${value}` : value;
  const escaped = safeValue.replaceAll("\"", "\"\"");
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}
