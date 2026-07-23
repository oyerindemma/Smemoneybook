export const taxAssistantRuleSetVersion = "ng-federal-2026-preview-v1";
export const taxAssistantPromptVersion = "tax-assistant-preview-v1";
export const taxAssistantToolVersion = "tax-assistant-tools-v1";
export const taxAssistantSnapshotVersion = "tax-assistant-v2";

export const taxAssistantDisclaimer =
  "This report is an estimate based on records available in SME MoneyBook. It is not a filed tax return and does not replace advice from a qualified tax professional or confirmation from the relevant tax authority.";

export type TaxAssistantPermission =
  | "tax_assistant:read"
  | "tax_assistant:ask"
  | "tax_assistant:review"
  | "tax_assistant:export"
  | "tax_assistant:manage_settings";

export type TaxReviewSeverity = "critical" | "warning" | "information";

export type TaxReviewItemDto = {
  id: string;
  businessId: string;
  transactionId?: string;
  taxType: string;
  issueType: string;
  severity: TaxReviewSeverity;
  explanation: string;
  recommendedAction: string;
  status: "open" | "reviewed";
  amount?: number;
  recordLabel?: string;
};

export type TaxAssistantToolName =
  | "get_tax_summary"
  | "get_vat_estimate"
  | "get_wht_summary"
  | "get_tax_periods"
  | "get_tax_review_items"
  | "get_transaction_tax_context"
  | "get_reconciliation_tax_impact"
  | "get_data_quality_summary"
  | "explain_tax_calculation"
  | "get_tax_rule_source";

export type TaxAssistantSource = {
  ruleSetVersion: string;
  ruleSetStatus: string;
  jurisdiction: string;
  sourceTitle: string;
  sourceAuthority: string;
  sourceReference: string;
  lastVerifiedAt?: string;
  verificationOwner: string;
};

export type TaxAssistantSummary = {
  businessId: string;
  businessName: string;
  country: string;
  currency: string;
  jurisdiction: string;
  periodStart: string;
  periodEnd: string;
  filingFrequency: string;
  ruleSetVersion: string;
  ruleSetStatus: string;
  taxRuleRequiresVerification: boolean;
  generatedAt: string;
  profile: {
    vatRegistered: boolean;
    vatRegistrationDate?: string;
    filingFrequency: string;
    fiscalYearStartMonth: number;
    pricingMode: string;
    whtApplicable: boolean;
    businessType?: string;
    industryCategory?: string;
    maskedTaxIdentificationNumber?: string;
    setupRequired: string[];
  };
  figures: {
    taxableSales: number;
    exemptSales: number;
    zeroRatedSales: number;
    outputVatEstimate: number;
    eligibleInputVatEstimate: number;
    netVatEstimate: number;
    whtDeductedByCustomers: number;
    whtDeductedFromSuppliers: number;
    potentialWhtCredit: number;
    taxableExpenses: number;
    expensesMissingReceipts: number;
    expensesMissingSupplierDetails: number;
    salesMissingCustomerOrInvoiceData: number;
    reconciledTaxImpactingAmount: number;
    unreconciledTaxImpactingAmount: number;
    unclassifiedTransactions: number;
    estimatedTaxDue: number;
    unresolvedTaxImpactingAmount: number;
    dataCompletenessRate: number;
    taxReadinessScore: number;
  };
  counts: {
    transactionCount: number;
    includedTransactionCount: number;
    excludedReversedCount: number;
    probableDuplicateCount: number;
    reviewItemCount: number;
    criticalReviewItemCount: number;
    unreconciledBankEntryCount: number;
  };
  formulas: Array<{
    label: string;
    formula: string;
    sourceTables: string[];
  }>;
  assumptions: string[];
  missingInformation: string[];
  reviewItems: TaxReviewItemDto[];
  reminders: string[];
  source: TaxAssistantSource;
  disclaimer: string;
};

export type TaxAssistantChatAnswer = {
  conversationId: string;
  messageId: string;
  answer: string;
  toolCalls: Array<{ name: TaxAssistantToolName; ok: boolean }>;
  source: TaxAssistantSource;
  provider: "configured-grounded" | "setup_required";
  promptVersion: string;
  disclaimer: string;
};
