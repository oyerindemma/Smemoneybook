export const loanReadinessFormulaVersion = "LR_COMPOSITE_V1";

export const loanReadinessDisclaimer =
  "This assessment measures the completeness and consistency of records available in SME MoneyBook. It is not a credit score, loan approval or lending decision. Every lender applies its own eligibility and risk criteria.";

export type LoanReadinessPermission =
  | "loan_readiness:read"
  | "loan_readiness:generate"
  | "loan_readiness:export"
  | "loan_readiness:manage_profile";

export type LoanReadinessStatus =
  | "Ready"
  | "Needs attention"
  | "Insufficient history"
  | "Missing data"
  | "Not applicable";

export type LoanReadinessCategoryId =
  | "business_profile"
  | "bookkeeping_history"
  | "sales_consistency"
  | "expense_completeness"
  | "profitability_evidence"
  | "cash_movement"
  | "bank_reconciliation"
  | "customer_debt"
  | "supplier_obligations"
  | "tax_readiness"
  | "inventory_evidence"
  | "supporting_documents"
  | "data_quality";

export type LoanReadinessMetricValue = string | number | boolean | null;

export type LoanReadinessCategory = {
  id: LoanReadinessCategoryId;
  label: string;
  formula: string;
  weight: number;
  percentage: number | null;
  weightedPoints: number;
  status: LoanReadinessStatus;
  explanation: string;
  evidence: string[];
  actions: string[];
  metrics: Record<string, LoanReadinessMetricValue>;
};

export type LoanReadinessDocumentDto = {
  documentType: string;
  label: string;
  status: "MISSING" | "AVAILABLE" | "NEEDS_UPDATE";
  reference?: string;
  issuedAt?: string;
  expiresAt?: string;
  notes?: string;
};

export type LoanReadinessProfileDto = {
  industry?: string;
  operatingStartDate?: string;
  fundingPurpose?: string;
  requestedAmount?: number;
  preferredCurrency: string;
  consentToShare: boolean;
  documents: LoanReadinessDocumentDto[];
  updatedAt?: string;
};

export type LoanReadinessEvidence = {
  period: {
    start: string;
    end: string;
    days: number;
  };
  sourceCounts: {
    transactions: number;
    payments: number;
    openDebts: number;
    bankRows: number;
    taxSnapshots: number;
    inventoryItems: number;
    inventoryMovements: number;
    issuedDocuments: number;
    checklistDocuments: number;
  };
  activityMonths: string[];
  salesMonths: string[];
  expenseMonths: string[];
  cashMovementMonths: string[];
  bank: {
    totalRows: number;
    coveredRows: number;
    unresolvedRows: number;
    unresolvedAmount: number;
  };
  debt: {
    openCustomerReceivables: number;
    overdueCustomerReceivables: number;
    topDebtorConcentrationPercent: number;
    openSupplierObligations: number;
  };
  tax: {
    profileConfigured: boolean;
    snapshotCount: number;
    openCriticalReviewItems: number;
    openReviewItems: number;
  };
  dataQuality: {
    missingCategories: number;
    missingPartyLinks: number;
    duplicateFingerprints: number;
    reversalCount: number;
    unresolvedBankRows: number;
    openTaxReviewItems: number;
  };
  limitations: string[];
};

export type LoanReadinessReport = {
  business: {
    id: string;
    name: string;
    currency: string;
  };
  location: {
    id: string | null;
    name: string;
  };
  formulaVersion: typeof loanReadinessFormulaVersion;
  generatedAt: string;
  expiresAt: string;
  percentage: number;
  overallStatus: LoanReadinessStatus;
  categories: LoanReadinessCategory[];
  evidence: LoanReadinessEvidence;
  recommendations: string[];
  profile: LoanReadinessProfileDto;
  disclaimer: typeof loanReadinessDisclaimer;
};

export type LoanReadinessCapabilities = {
  canRead: boolean;
  canGenerate: boolean;
  canExport: boolean;
  canManageProfile: boolean;
};

export type LoanReadinessHistoryItem = {
  id: string;
  formulaVersion: string;
  percentage: number;
  overallStatus: string;
  generatedAt: string;
  expiresAt?: string;
  locationId?: string;
  locationName?: string;
  generatedByName?: string;
};

export const loanReadinessDocumentTypes = [
  "business_registration",
  "bank_statements",
  "financial_statements",
  "tax_records",
  "sales_records",
  "supplier_records",
] as const;

export type LoanReadinessDocumentType = (typeof loanReadinessDocumentTypes)[number];

export const loanReadinessDocumentLabels: Record<LoanReadinessDocumentType, string> = {
  business_registration: "Business registration",
  bank_statements: "Bank statements",
  financial_statements: "Financial statements",
  tax_records: "Tax records",
  sales_records: "Sales records",
  supplier_records: "Supplier records",
};
