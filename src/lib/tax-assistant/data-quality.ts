import type { TaxReviewItemDto, TaxReviewSeverity } from "@/lib/tax-assistant/definitions";

export type TaxQualityTransaction = {
  id: string;
  businessId: string;
  type: string;
  amount: number;
  description: string;
  category?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  receiptId?: string | null;
  taxTreatment?: string | null;
  hasInvoiceOrSnapshot: boolean;
  isReconciled: boolean;
  isReversed: boolean;
  isDuplicate: boolean;
  occurredAt: Date;
};

export type TaxQualityProfile = {
  businessId: string;
  vatRegistrationKnown: boolean;
  ruleSetVerified: boolean;
};

export function buildTaxReviewItems({
  businessId,
  profile,
  transactions,
  unreconciledBankEntryCount,
}: {
  businessId: string;
  profile: TaxQualityProfile;
  transactions: TaxQualityTransaction[];
  unreconciledBankEntryCount: number;
}): TaxReviewItemDto[] {
  const items: TaxReviewItemDto[] = [];

  if (!profile.vatRegistrationKnown) {
    items.push(profileIssue({
      businessId,
      issueType: "missing_vat_registration_status",
      taxType: "VAT",
      severity: "critical",
      explanation: "VAT registration status is not configured for this business.",
      recommendedAction: "Confirm whether the business is VAT registered before relying on VAT estimates.",
    }));
  }

  if (!profile.ruleSetVerified) {
    items.push(profileIssue({
      businessId,
      issueType: "tax_rule_version_not_verified",
      taxType: "ALL",
      severity: "critical",
      explanation: "Tax rule requires verification.",
      recommendedAction: "Verify the active tax-rule set against official sources before using estimates.",
    }));
  }

  if (unreconciledBankEntryCount > 0) {
    items.push(profileIssue({
      businessId,
      issueType: "unreconciled_bank_entry",
      taxType: "VAT",
      severity: "warning",
      explanation: `${unreconciledBankEntryCount} bank statement entries in the selected period are not matched.`,
      recommendedAction: "Review unreconciled bank entries that may represent taxable sales or deductible expenses.",
      amount: unreconciledBankEntryCount,
    }));
  }

  for (const transaction of transactions) {
    if (transaction.isReversed) {
      items.push(transactionIssue(transaction, {
        issueType: "reversed_record_excluded",
        taxType: "ALL",
        severity: "information",
        explanation: "This transaction is reversed or is itself a reversal and is excluded from tax estimates.",
        recommendedAction: "Confirm the reversal is intentional before using the period summary.",
      }));
      continue;
    }

    if (transaction.amount < 0) {
      items.push(transactionIssue(transaction, {
        issueType: "unexpected_negative_value",
        taxType: "ALL",
        severity: "warning",
        explanation: "This transaction has an unexpected negative amount.",
        recommendedAction: "Review the amount and use reversal flows for corrections where applicable.",
      }));
    }

    if (transaction.isDuplicate) {
      items.push(transactionIssue(transaction, {
        issueType: "duplicate_transaction",
        taxType: "ALL",
        severity: "warning",
        explanation: "This transaction looks similar to another record in the same period.",
        recommendedAction: "Review possible duplicates before using tax estimates.",
      }));
    }

    if (!transaction.category) {
      items.push(transactionIssue(transaction, {
        issueType: "missing_category",
        taxType: "ALL",
        severity: "warning",
        explanation: "This transaction has no category.",
        recommendedAction: "Add a clear category so taxable and deductible treatment can be reviewed.",
      }));
    }

    if (!transaction.taxTreatment) {
      items.push(transactionIssue(transaction, {
        issueType: "missing_tax_treatment",
        taxType: "VAT",
        severity: "warning",
        explanation: "This transaction has no explicit tax treatment.",
        recommendedAction: "Review whether it is taxable, exempt, zero-rated or out of scope.",
      }));
    }

    if (transaction.type === "SALE") {
      if (!transaction.customerId && !transaction.hasInvoiceOrSnapshot) {
        items.push(transactionIssue(transaction, {
          issueType: "missing_customer_or_invoice",
          taxType: "VAT",
          severity: "warning",
          explanation: "This sale has no customer or invoice/tax snapshot evidence.",
          recommendedAction: "Attach customer or invoice evidence before relying on this sale for filing preparation.",
        }));
      }
    }

    if (transaction.type === "EXPENSE") {
      if (!transaction.supplierId) {
        items.push(transactionIssue(transaction, {
          issueType: "missing_supplier",
          taxType: "VAT_INPUT",
          severity: "warning",
          explanation: "This expense has no supplier record.",
          recommendedAction: "Add supplier details to support deductible expense review.",
        }));
      }

      if (!transaction.receiptId && !transaction.hasInvoiceOrSnapshot) {
        items.push(transactionIssue(transaction, {
          issueType: "missing_receipt",
          taxType: "VAT_INPUT",
          severity: "warning",
          explanation: "This expense has no receipt, invoice or tax snapshot evidence.",
          recommendedAction: "Attach receipt evidence before treating input VAT as eligible.",
        }));
      }
    }

    if ((transaction.type === "SALE" || transaction.type === "EXPENSE") && !transaction.isReconciled) {
      items.push(transactionIssue(transaction, {
        issueType: "unreconciled_transaction",
        taxType: "ALL",
        severity: "information",
        explanation: "This tax-impacting transaction is not linked to a confirmed bank reconciliation match.",
        recommendedAction: "Review bank reconciliation status before filing-period review.",
      }));
    }
  }

  return items;
}

function profileIssue(input: {
  businessId: string;
  issueType: string;
  taxType: string;
  severity: TaxReviewSeverity;
  explanation: string;
  recommendedAction: string;
  amount?: number;
}): TaxReviewItemDto {
  return {
    id: `tax-review:profile:${input.issueType}`,
    businessId: input.businessId,
    taxType: input.taxType,
    issueType: input.issueType,
    severity: input.severity,
    explanation: input.explanation,
    recommendedAction: input.recommendedAction,
    status: "open",
    amount: input.amount,
  };
}

function transactionIssue(
  transaction: TaxQualityTransaction,
  issue: {
    issueType: string;
    taxType: string;
    severity: TaxReviewSeverity;
    explanation: string;
    recommendedAction: string;
  },
): TaxReviewItemDto {
  return {
    id: `tax-review:${transaction.id}:${issue.issueType}`,
    businessId: transaction.businessId,
    transactionId: transaction.id,
    taxType: issue.taxType,
    issueType: issue.issueType,
    severity: issue.severity,
    explanation: issue.explanation,
    recommendedAction: issue.recommendedAction,
    status: "open",
    amount: transaction.amount,
    recordLabel: transaction.description,
  };
}
