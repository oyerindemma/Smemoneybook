import { Prisma } from "@prisma/client";
import {
  taxAssistantDisclaimer,
  type TaxAssistantSource,
  type TaxAssistantSummary,
} from "@/lib/tax-assistant/definitions";
import { buildTaxReviewItems, type TaxQualityTransaction } from "@/lib/tax-assistant/data-quality";
import { getDefaultRuleSource, isRuleSetVerified, maskTaxIdentificationNumber } from "@/lib/tax-assistant/rules";

const zero = new Prisma.Decimal(0);

export type TaxRuleInput = {
  taxType: string;
  transactionType: string;
  rate: DecimalLike;
  threshold?: DecimalLike | null;
  status: string;
};

export type TaxProfileInput = {
  businessId: string;
  jurisdiction: string;
  taxIdentificationNumber?: string | null;
  vatRegistered: boolean;
  vatRegistrationDate?: Date | null;
  filingFrequency: string;
  fiscalYearStartMonth: number;
  defaultCurrency: string;
  pricingMode: string;
  whtApplicable: boolean;
  businessType?: string | null;
  industryCategory?: string | null;
  setupRequired: string[];
};

export type TaxRuleSetInput = {
  version: string;
  status: string;
  jurisdiction: string;
  sourceTitle: string;
  sourceAuthority: string;
  sourceReference: string;
  lastVerifiedAt?: Date | null;
  verificationOwner: string;
  rules: TaxRuleInput[];
};

export type TaxTransactionInput = {
  id: string;
  businessId: string;
  type: string;
  amount: DecimalLike;
  description: string;
  category?: string | null;
  paymentStatus?: string | null;
  occurredAt: Date;
  customerId?: string | null;
  supplierId?: string | null;
  receiptId?: string | null;
  taxTreatment?: string | null;
  taxMetadata?: unknown;
  vatInclusive?: boolean | null;
  withholdingTaxRate?: DecimalLike | null;
  withholdingTaxAmount?: DecimalLike | null;
  duplicateFingerprint?: string | null;
  isOriginalReversed?: boolean;
  isReversal?: boolean;
  taxSnapshotCount?: number;
  confirmedReconciliationCount?: number;
};

export type TaxCalculationInput = {
  businessId: string;
  businessName: string;
  country: string;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  filingFrequency: string;
  generatedAt?: Date;
  profile: TaxProfileInput;
  ruleSet?: TaxRuleSetInput | null;
  transactions: TaxTransactionInput[];
  unreconciledBankEntries: Array<{ id: string; amount: DecimalLike; direction: string }>;
};

type DecimalLike = Prisma.Decimal | number | string | { toString(): string };

export function calculateTaxAssistantSummary(input: TaxCalculationInput): TaxAssistantSummary {
  const generatedAt = input.generatedAt ?? new Date();
  const ruleSet = input.ruleSet;
  const ruleSetVerified = isRuleSetVerified(ruleSet);
  const source = sourceFromRuleSet(ruleSet);
  const vatOutputRule = activeRule(ruleSet, "VAT", "SALE");
  const vatInputRule = activeRule(ruleSet, "VAT_INPUT", "EXPENSE");
  const duplicateIds = findDuplicateIds(input.transactions);
  const allTransactions = input.transactions.map((transaction) => normalizeTransaction(transaction, duplicateIds));
  const includedTransactions = allTransactions.filter(
    (transaction) => !transaction.isReversed && !transaction.isDuplicate && isTaxImpacting(transaction.type),
  );
  const sales = includedTransactions.filter((transaction) => transaction.type === "SALE");
  const expenses = includedTransactions.filter((transaction) => transaction.type === "EXPENSE");
  const outputVat = sales.reduce((sum, transaction) => {
    if (!input.profile.vatRegistered || !isTaxableTreatment(transaction.taxTreatment)) {
      return sum;
    }

    return sum.plus(vatParts(transaction.amountDecimal, vatOutputRule, isInclusive(input.profile, transaction)).tax);
  }, zero);
  const taxableSales = sales.reduce((sum, transaction) => {
    if (!isTaxableTreatment(transaction.taxTreatment)) {
      return sum;
    }

    return sum.plus(vatParts(transaction.amountDecimal, vatOutputRule, isInclusive(input.profile, transaction)).base);
  }, zero);
  const exemptSales = sales.reduce((sum, transaction) => {
    return normalizeTreatment(transaction.taxTreatment) === "exempt" ? sum.plus(transaction.amountDecimal) : sum;
  }, zero);
  const zeroRatedSales = sales.reduce((sum, transaction) => {
    return normalizeTreatment(transaction.taxTreatment) === "zero_rated" ? sum.plus(transaction.amountDecimal) : sum;
  }, zero);
  const inputVat = expenses.reduce((sum, transaction) => {
    if (!input.profile.vatRegistered || !isTaxableTreatment(transaction.taxTreatment)) {
      return sum;
    }

    if (!transaction.receiptId && transaction.taxSnapshotCount === 0) {
      return sum;
    }

    return sum.plus(vatParts(transaction.amountDecimal, vatInputRule, isInclusive(input.profile, transaction)).tax);
  }, zero);
  const taxableExpenses = expenses.reduce((sum, transaction) => {
    return isTaxableTreatment(transaction.taxTreatment)
      ? sum.plus(vatParts(transaction.amountDecimal, vatInputRule, isInclusive(input.profile, transaction)).base)
      : sum;
  }, zero);
  const whtDeductedByCustomers = sales.reduce((sum, transaction) => sum.plus(withholdingAmount(transaction)), zero);
  const whtDeductedFromSuppliers = expenses.reduce((sum, transaction) => sum.plus(withholdingAmount(transaction)), zero);
  const reconciledTaxImpactingAmount = includedTransactions.reduce(
    (sum, transaction) => transaction.isReconciled ? sum.plus(transaction.amountDecimal) : sum,
    zero,
  );
  const unreconciledTaxImpactingAmount = includedTransactions.reduce(
    (sum, transaction) => transaction.isReconciled ? sum : sum.plus(transaction.amountDecimal),
    zero,
  );
  const expensesMissingReceipts = expenses.reduce((sum, transaction) => {
    return !transaction.receiptId && transaction.taxSnapshotCount === 0 ? sum.plus(transaction.amountDecimal) : sum;
  }, zero);
  const expensesMissingSupplierDetails = expenses.reduce((sum, transaction) => {
    return transaction.supplierId ? sum : sum.plus(transaction.amountDecimal);
  }, zero);
  const salesMissingCustomerOrInvoiceData = sales.reduce((sum, transaction) => {
    return transaction.customerId || transaction.taxSnapshotCount > 0 ? sum : sum.plus(transaction.amountDecimal);
  }, zero);
  const unclassifiedTransactions = includedTransactions.filter((transaction) => !transaction.category).length;
  const reviewItems = buildTaxReviewItems({
    businessId: input.businessId,
    profile: {
      businessId: input.businessId,
      vatRegistrationKnown: input.profile.setupRequired.every((item) => !item.toLowerCase().includes("vat registration")),
      ruleSetVerified,
    },
    transactions: allTransactions,
    unreconciledBankEntryCount: input.unreconciledBankEntries.length,
  });
  const criticalReviewItemCount = reviewItems.filter((item) => item.severity === "critical").length;
  const unresolvedTaxImpactingAmount = expensesMissingReceipts
    .plus(expensesMissingSupplierDetails)
    .plus(salesMissingCustomerOrInvoiceData)
    .plus(unreconciledTaxImpactingAmount);
  const dataCompletenessRate = calculateCompleteness({
    transactions: includedTransactions,
    profileComplete: input.profile.setupRequired.length === 0,
    ruleSetVerified,
  });
  const taxReadinessScore = calculateReadinessScore({
    ruleSetVerified,
    profileComplete: input.profile.setupRequired.length === 0,
    dataCompletenessRate,
    reconciliationRate: includedTransactions.length
      ? includedTransactions.filter((transaction) => transaction.isReconciled).length / includedTransactions.length
      : 0,
    criticalReviewItemCount,
  });
  const netVat = outputVat.minus(inputVat);
  const taxDueAfterCredits = netVat.minus(whtDeductedByCustomers);
  const estimatedTaxDue = taxDueAfterCredits.gt(0) ? taxDueAfterCredits : zero;

  return {
    businessId: input.businessId,
    businessName: input.businessName,
    country: input.country,
    currency: input.currency,
    jurisdiction: input.profile.jurisdiction,
    periodStart: input.periodStart.toISOString(),
    periodEnd: input.periodEnd.toISOString(),
    filingFrequency: input.filingFrequency,
    ruleSetVersion: source.ruleSetVersion,
    ruleSetStatus: source.ruleSetStatus,
    taxRuleRequiresVerification: !ruleSetVerified,
    generatedAt: generatedAt.toISOString(),
    profile: {
      vatRegistered: input.profile.vatRegistered,
      vatRegistrationDate: input.profile.vatRegistrationDate?.toISOString(),
      filingFrequency: input.profile.filingFrequency,
      fiscalYearStartMonth: input.profile.fiscalYearStartMonth,
      pricingMode: input.profile.pricingMode,
      whtApplicable: input.profile.whtApplicable,
      businessType: input.profile.businessType ?? undefined,
      industryCategory: input.profile.industryCategory ?? undefined,
      maskedTaxIdentificationNumber: maskTaxIdentificationNumber(input.profile.taxIdentificationNumber),
      setupRequired: input.profile.setupRequired,
    },
    figures: {
      taxableSales: money(taxableSales),
      exemptSales: money(exemptSales),
      zeroRatedSales: money(zeroRatedSales),
      outputVatEstimate: money(outputVat),
      eligibleInputVatEstimate: money(inputVat),
      netVatEstimate: money(netVat),
      whtDeductedByCustomers: money(whtDeductedByCustomers),
      whtDeductedFromSuppliers: money(whtDeductedFromSuppliers),
      potentialWhtCredit: money(whtDeductedByCustomers),
      taxableExpenses: money(taxableExpenses),
      expensesMissingReceipts: money(expensesMissingReceipts),
      expensesMissingSupplierDetails: money(expensesMissingSupplierDetails),
      salesMissingCustomerOrInvoiceData: money(salesMissingCustomerOrInvoiceData),
      reconciledTaxImpactingAmount: money(reconciledTaxImpactingAmount),
      unreconciledTaxImpactingAmount: money(unreconciledTaxImpactingAmount),
      unclassifiedTransactions,
      estimatedTaxDue: money(estimatedTaxDue),
      unresolvedTaxImpactingAmount: money(unresolvedTaxImpactingAmount),
      dataCompletenessRate,
      taxReadinessScore,
    },
    counts: {
      transactionCount: allTransactions.length,
      includedTransactionCount: includedTransactions.length,
      excludedReversedCount: allTransactions.filter((transaction) => transaction.isReversed).length,
      probableDuplicateCount: allTransactions.filter((transaction) => transaction.isDuplicate).length,
      reviewItemCount: reviewItems.length,
      criticalReviewItemCount,
      unreconciledBankEntryCount: input.unreconciledBankEntries.length,
    },
    formulas: [
      {
        label: "Output VAT",
        formula: "taxable sale base x verified VAT rate; inclusive sales use gross - gross / (1 + rate)",
        sourceTables: ["Transaction", "DocumentTaxSnapshot", "TaxRule", "BusinessTaxProfile"],
      },
      {
        label: "Eligible input VAT",
        formula: "eligible expense base x verified VAT rate, limited to expenses with receipt or tax snapshot evidence",
        sourceTables: ["Transaction", "Receipt", "DocumentTaxSnapshot", "TaxRule"],
      },
      {
        label: "Net VAT estimate",
        formula: "output VAT estimate - eligible input VAT estimate",
        sourceTables: ["Transaction", "TaxRule"],
      },
      {
        label: "Tax-readiness score",
        formula: "20 rule verification + 20 profile completion + 25 data completeness + 15 reconciliation coverage + 20 critical-issue clearance",
        sourceTables: ["TaxRuleSet", "BusinessTaxProfile", "Transaction", "BankReconciliationMatch"],
      },
    ],
    assumptions: [
      "Only recorded SME MoneyBook transactions in the selected period are included.",
      "Confirmed reversal pairs and probable duplicate records are excluded from estimates.",
      "Transaction payments are not counted separately from the transaction amount.",
      "WHT is totaled only from explicit transaction WHT metadata or recorded WHT amounts.",
    ],
    missingInformation: input.profile.setupRequired,
    reviewItems,
    reminders: buildReminders(input.profile.setupRequired, reviewItems.length),
    source,
    disclaimer: taxAssistantDisclaimer,
  };
}

type NormalizedTaxTransaction = TaxQualityTransaction & {
  amountDecimal: Prisma.Decimal;
  paymentStatus?: string | null;
  duplicateFingerprint?: string | null;
  taxMetadata?: unknown;
  vatInclusive?: boolean | null;
  withholdingTaxRate?: DecimalLike | null;
  withholdingTaxAmount?: DecimalLike | null;
  taxSnapshotCount: number;
};

function normalizeTransaction(
  transaction: TaxTransactionInput,
  duplicateIds: Set<string>,
): NormalizedTaxTransaction {
  return {
    id: transaction.id,
    businessId: transaction.businessId,
    type: transaction.type.toUpperCase(),
    amount: money(dec(transaction.amount)),
    amountDecimal: dec(transaction.amount),
    description: transaction.description,
    category: transaction.category,
    customerId: transaction.customerId,
    supplierId: transaction.supplierId,
    receiptId: transaction.receiptId,
    taxTreatment: normalizeTreatment(transaction.taxTreatment),
    taxMetadata: transaction.taxMetadata,
    vatInclusive: transaction.vatInclusive,
    withholdingTaxRate: transaction.withholdingTaxRate,
    withholdingTaxAmount: transaction.withholdingTaxAmount,
    hasInvoiceOrSnapshot: Boolean(transaction.taxSnapshotCount && transaction.taxSnapshotCount > 0),
    taxSnapshotCount: transaction.taxSnapshotCount ?? 0,
    isReconciled: Boolean(transaction.confirmedReconciliationCount && transaction.confirmedReconciliationCount > 0),
    isReversed: Boolean(transaction.isOriginalReversed || transaction.isReversal),
    isDuplicate: duplicateIds.has(transaction.id),
    occurredAt: transaction.occurredAt,
    duplicateFingerprint: transaction.duplicateFingerprint,
    paymentStatus: transaction.paymentStatus,
  };
}

function activeRule(ruleSet: TaxRuleSetInput | null | undefined, taxType: string, transactionType: string) {
  const rule = ruleSet?.rules.find((candidate) => (
    candidate.status === "verified" &&
    candidate.taxType === taxType &&
    candidate.transactionType === transactionType
  ));

  return {
    rate: rule ? dec(rule.rate) : zero,
    threshold: rule?.threshold ? dec(rule.threshold) : null,
  };
}

function vatParts(
  amount: Prisma.Decimal,
  rule: { rate: Prisma.Decimal; threshold: Prisma.Decimal | null },
  inclusive: boolean,
) {
  if (rule.rate.lte(0) || amount.lte(0)) {
    return { base: amount, tax: zero };
  }

  if (rule.threshold && amount.lt(rule.threshold)) {
    return { base: zero, tax: zero };
  }

  const rate = rule.rate.div(100);

  if (inclusive) {
    const base = amount.div(rate.plus(1));
    return { base, tax: amount.minus(base) };
  }

  return { base: amount, tax: amount.mul(rate) };
}

function isInclusive(profile: TaxProfileInput, transaction: NormalizedTaxTransaction) {
  if (typeof transaction.vatInclusive === "boolean") {
    return transaction.vatInclusive;
  }

  return profile.pricingMode === "tax_inclusive";
}

function withholdingAmount(transaction: NormalizedTaxTransaction) {
  const recorded = nullableDecimal(transaction.withholdingTaxAmount);

  if (recorded && recorded.gt(0)) {
    return recorded;
  }

  const rate = nullableDecimal(transaction.withholdingTaxRate);

  if (rate && rate.gt(0)) {
    return transaction.amountDecimal.mul(rate.div(100));
  }

  const metadataAmount = metadataNumber(transaction.taxMetadata, ["whtAmount", "withholdingTaxAmount"]);
  return metadataAmount.gt(0) ? metadataAmount : zero;
}

function metadataNumber(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object") {
    return zero;
  }

  const record = value as Record<string, unknown>;

  for (const key of keys) {
    const item = record[key];
    if (typeof item === "number" || typeof item === "string") {
      return dec(item);
    }
  }

  return zero;
}

function findDuplicateIds(transactions: TaxTransactionInput[]) {
  const seen = new Map<string, string>();
  const duplicateIds = new Set<string>();

  for (const transaction of transactions) {
    const key = [
      transaction.type.toUpperCase(),
      dec(transaction.amount).toFixed(2),
      transaction.occurredAt.toISOString().slice(0, 10),
      transaction.description.trim().toLowerCase().replace(/\s+/g, " "),
    ].join(":");

    const first = seen.get(key);
    if (first) {
      duplicateIds.add(transaction.id);
    } else {
      seen.set(key, transaction.id);
    }
  }

  return duplicateIds;
}

function calculateCompleteness({
  transactions,
  profileComplete,
  ruleSetVerified,
}: {
  transactions: NormalizedTaxTransaction[];
  profileComplete: boolean;
  ruleSetVerified: boolean;
}) {
  const totalChecks = Math.max(1, transactions.length * 5 + 2);
  let passed = 0;

  if (profileComplete) {
    passed += 1;
  }

  if (ruleSetVerified) {
    passed += 1;
  }

  for (const transaction of transactions) {
    if (transaction.category) passed += 1;
    if (transaction.taxTreatment) passed += 1;
    if (transaction.type !== "SALE" || transaction.customerId || transaction.taxSnapshotCount > 0) passed += 1;
    if (transaction.type !== "EXPENSE" || transaction.supplierId) passed += 1;
    if (transaction.type !== "EXPENSE" || transaction.receiptId || transaction.taxSnapshotCount > 0) passed += 1;
  }

  return Math.round((passed / totalChecks) * 100);
}

function calculateReadinessScore({
  ruleSetVerified,
  profileComplete,
  dataCompletenessRate,
  reconciliationRate,
  criticalReviewItemCount,
}: {
  ruleSetVerified: boolean;
  profileComplete: boolean;
  dataCompletenessRate: number;
  reconciliationRate: number;
  criticalReviewItemCount: number;
}) {
  const score =
    (ruleSetVerified ? 20 : 0) +
    (profileComplete ? 20 : 0) +
    Math.round(dataCompletenessRate * 0.25) +
    Math.round(reconciliationRate * 15) +
    (criticalReviewItemCount === 0 ? 20 : 0);

  return Math.max(0, Math.min(100, score));
}

function sourceFromRuleSet(ruleSet?: TaxRuleSetInput | null): TaxAssistantSource {
  if (!ruleSet) {
    return {
      ...getDefaultRuleSource(),
      ruleSetStatus: "missing",
    };
  }

  return {
    ruleSetVersion: ruleSet.version,
    ruleSetStatus: ruleSet.status,
    jurisdiction: ruleSet.jurisdiction,
    sourceTitle: ruleSet.sourceTitle,
    sourceAuthority: ruleSet.sourceAuthority,
    sourceReference: ruleSet.sourceReference,
    lastVerifiedAt: ruleSet.lastVerifiedAt?.toISOString(),
    verificationOwner: ruleSet.verificationOwner,
  };
}

function buildReminders(setupRequired: string[], reviewItemCount: number) {
  const reminders = ["Review estimates with a qualified tax professional before filing."];

  if (setupRequired.length > 0) {
    reminders.push("Complete Tax Assistant setup before relying on filing-period estimates.");
  }

  if (reviewItemCount > 0) {
    reminders.push("Resolve tax review items before sharing a working paper.");
  }

  return reminders;
}

function isTaxImpacting(type: string) {
  return type === "SALE" || type === "EXPENSE";
}

function isTaxableTreatment(value?: string | null) {
  const treatment = normalizeTreatment(value);
  return !treatment || treatment === "taxable";
}

function normalizeTreatment(value?: string | null) {
  const normalized = (value ?? "").toLowerCase().trim();

  if (["taxable", "exempt", "zero_rated", "out_of_scope"].includes(normalized)) {
    return normalized;
  }

  return undefined;
}

function nullableDecimal(value: DecimalLike | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = dec(value);
  return Number.isFinite(parsed.toNumber()) ? parsed : null;
}

function dec(value: DecimalLike) {
  return new Prisma.Decimal(value.toString());
}

function money(value: Prisma.Decimal) {
  return Number(value.toFixed(2));
}
