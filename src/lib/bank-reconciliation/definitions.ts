export const bankReconciliationSnapshotVersion = "bank-reconciliation-v2";

export type BankReconciliationPermission =
  | "bank_reconciliation:read"
  | "bank_reconciliation:import"
  | "bank_reconciliation:match"
  | "bank_reconciliation:review"
  | "bank_reconciliation:export"
  | "bank_reconciliation:ignore";

export type BankStatementDirection = "inflow" | "outflow";

export type BankStatementRowStatus =
  | "UNMATCHED"
  | "SUGGESTED"
  | "MATCHED"
  | "DUPLICATE"
  | "IGNORED";

export type BankStatementDuplicateStatus =
  | "UNIQUE"
  | "PROBABLE_DUPLICATE"
  | "CONFIRMED_DUPLICATE";

export type BankReconciliationMatchStatus =
  | "SUGGESTED"
  | "CONFIRMED"
  | "REJECTED"
  | "UNMATCHED"
  | "DUPLICATE";

export type BankReconciliationMatchType =
  | "exact"
  | "date_tolerant"
  | "reference_based"
  | "description_based"
  | "amount_only"
  | "manual"
  | "duplicate"
  | "missing_record"
  | "split"
  | "grouped";

export type BankStatementColumnMapping = {
  postedAt?: string;
  valueDate?: string;
  description?: string;
  amount?: string;
  debit?: string;
  credit?: string;
  reference?: string;
  externalReference?: string;
  balance?: string;
};

export type ParsedBankStatementRow = {
  id?: string;
  rowNumber: number;
  postedAt: Date;
  valueDate?: Date;
  amount: number;
  direction: BankStatementDirection;
  description: string;
  normalizedDescription: string;
  reference?: string;
  externalReference?: string;
  debitAmount: number;
  creditAmount: number;
  signedAmount: number;
  balance?: number;
  fingerprint: string;
  duplicateStatus: BankStatementDuplicateStatus;
  duplicateOfRowNumber?: number;
  duplicateOfRowId?: string;
  suggestedCategory?: string;
  raw: Record<string, string>;
};

export type BankStatementParseError = {
  rowNumber: number;
  message: string;
};

export type BankStatementParseResult = {
  headers: string[];
  mapping: Required<BankStatementColumnMapping>;
  rows: ParsedBankStatementRow[];
  errors: BankStatementParseError[];
  warnings: string[];
  statementStart?: Date;
  statementEnd?: Date;
  duplicateRowCount: number;
  totals: {
    inflow: number;
    outflow: number;
    net: number;
  };
};

export type BankStatementPreviewRow = Omit<ParsedBankStatementRow, "postedAt" | "valueDate"> & {
  postedAt: string;
  valueDate?: string;
};

export type BankStatementPreview = {
  headers: string[];
  mapping: Required<BankStatementColumnMapping>;
  rowCount: number;
  previewRows: BankStatementPreviewRow[];
  errors: BankStatementParseError[];
  warnings: string[];
  statementStart?: string;
  statementEnd?: string;
  duplicateRowCount: number;
  crossImportDuplicateCount: number;
  totals: BankStatementParseResult["totals"];
};

export type ReconciliationTransaction = {
  id: string;
  idempotencyKey?: string | null;
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
  matchType: BankReconciliationMatchType;
  status: BankReconciliationMatchStatus;
  confidence: number;
  confidenceReasons: string[];
  signals: {
    amountMatches?: boolean;
    dateDistanceDays?: number;
    directionMatches?: boolean;
    accountMatches?: boolean;
    descriptionOverlap?: number;
    referenceMatches?: boolean;
    paymentStatus?: string;
    transactionType?: string;
    suggestedCategory?: string;
    duplicateOfRowNumber?: number;
    duplicateOfRowId?: string;
    reason?: string;
  };
};

export type BankReconciliationActionName =
  | "import_previewed"
  | "import_created"
  | "match_suggested"
  | "match_confirmed"
  | "match_rejected"
  | "manual_match_created"
  | "match_unmatched"
  | "entry_ignored"
  | "entry_reopened"
  | "import_locked"
  | "import_reopened"
  | "exported";

export const bankReconciliationStatuses: BankStatementRowStatus[] = [
  "SUGGESTED",
  "UNMATCHED",
  "MATCHED",
  "IGNORED",
  "DUPLICATE",
];
