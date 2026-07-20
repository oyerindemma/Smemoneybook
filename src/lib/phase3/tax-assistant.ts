export const taxAssistantRuleVersion = "tax-assistant-ng-v1";

export type TaxAssistantConfidence = "high" | "medium" | "low" | "insufficient_data";

export type TaxAssistantInput = {
  businessId: string;
  locationId?: string;
  periodStart: Date;
  periodEnd: Date;
  generatedAt?: Date;
  taxConfig?: {
    country: string;
    enabled: boolean;
    registrationNumber?: string | null;
    inclusiveByDefault: boolean;
    disclaimer?: string | null;
  } | null;
  rates: Array<{
    label: string;
    rate: number;
    type: string;
    isDefault: boolean;
  }>;
  transactions: Array<{
    type: string;
    amount: number;
    paymentStatus?: string | null;
    occurredAt: Date;
    category?: string | null;
    reversed?: boolean;
    hasTaxSnapshot?: boolean;
  }>;
  documentTaxSnapshots: Array<{
    label: string;
    rate: number;
    taxableAmount: number;
    taxAmount: number;
    inclusive: boolean;
    createdAt: Date;
  }>;
  priorTaxRuns: Array<{
    month: number;
    year: number;
    vatRate: number;
    salesTotal: number;
    vatTotal: number;
    createdAt: Date;
  }>;
};

export type TaxAssistantSummary = {
  businessId: string;
  locationId?: string;
  ruleVersion: typeof taxAssistantRuleVersion;
  country: string;
  confidence: TaxAssistantConfidence;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  taxableSales: number;
  estimatedTax: number;
  configuredRates: TaxAssistantInput["rates"];
  missingSettings: string[];
  inconsistencies: string[];
  reminders: string[];
  exportSummary: {
    transactionCount: number;
    taxableTransactionCount: number;
    documentTaxSnapshotCount: number;
    priorTaxRunCount: number;
  };
  dataWarnings: string[];
  sourceMetrics: Record<string, number | string | boolean | null>;
  disclaimer: string;
};

export function calculateTaxAssistantSummary(input: TaxAssistantInput): TaxAssistantSummary {
  const generatedAt = input.generatedAt ?? new Date();
  const country = input.taxConfig?.country || "NG";
  const activeTransactions = input.transactions.filter(
    (transaction) => !transaction.reversed && isInRange(transaction.occurredAt, input.periodStart, input.periodEnd),
  );
  const sales = activeTransactions.filter((transaction) => normalize(transaction.type) === "sale");
  const defaultRate = input.rates.find((rate) => rate.isDefault) ?? input.rates[0];
  const taxableSales = sales.reduce((sum, transaction) => sum + cleanAmount(transaction.amount), 0);
  const estimatedTax = input.taxConfig?.enabled && defaultRate
    ? taxableSales * (cleanAmount(defaultRate.rate) / 100)
    : 0;
  const missingSettings = findMissingSettings(input, defaultRate);
  const inconsistencies = findInconsistencies({
    sales,
    snapshots: input.documentTaxSnapshots,
    defaultRate,
    configEnabled: Boolean(input.taxConfig?.enabled),
  });
  const confidence = determineConfidence({
    missingSettings,
    salesCount: sales.length,
    snapshotCount: input.documentTaxSnapshots.length,
    configEnabled: Boolean(input.taxConfig?.enabled),
  });
  const dataWarnings = buildWarnings(confidence, country);
  const reminders = buildReminders(country, input.taxConfig?.enabled ?? false);

  return {
    businessId: input.businessId,
    locationId: input.locationId,
    ruleVersion: taxAssistantRuleVersion,
    country,
    confidence,
    generatedAt: generatedAt.toISOString(),
    periodStart: input.periodStart.toISOString(),
    periodEnd: input.periodEnd.toISOString(),
    taxableSales: roundMoney(taxableSales),
    estimatedTax: roundMoney(estimatedTax),
    configuredRates: input.rates,
    missingSettings,
    inconsistencies,
    reminders,
    exportSummary: {
      transactionCount: activeTransactions.length,
      taxableTransactionCount: sales.length,
      documentTaxSnapshotCount: input.documentTaxSnapshots.length,
      priorTaxRunCount: input.priorTaxRuns.length,
    },
    dataWarnings,
    sourceMetrics: {
      transactionCount: activeTransactions.length,
      salesCount: sales.length,
      taxableSales: roundMoney(taxableSales),
      defaultRatePercent: defaultRate?.rate ?? null,
      documentTaxSnapshotCount: input.documentTaxSnapshots.length,
      priorTaxRunCount: input.priorTaxRuns.length,
      taxConfigEnabled: Boolean(input.taxConfig?.enabled),
      inclusiveByDefault: Boolean(input.taxConfig?.inclusiveByDefault),
    },
    disclaimer: input.taxConfig?.disclaimer ||
      "This is a recordkeeping estimate from SME MoneyBook data. It is not tax advice, filing confirmation, or a legal guarantee.",
  };
}

function findMissingSettings(input: TaxAssistantInput, defaultRate?: TaxAssistantInput["rates"][number]) {
  const missing: string[] = [];

  if (!input.taxConfig) {
    missing.push("Tax settings are not configured.");
  }

  if (input.taxConfig && !input.taxConfig.enabled) {
    missing.push("Tax tracking is disabled.");
  }

  if (!input.taxConfig?.registrationNumber) {
    missing.push("Tax registration number is missing.");
  }

  if (!defaultRate) {
    missing.push("No default tax rate is configured.");
  }

  if ((input.taxConfig?.country || "NG") !== "NG") {
    missing.push("Only Nigeria tax-assistant rules are configured in this version.");
  }

  return missing;
}

function findInconsistencies({
  sales,
  snapshots,
  defaultRate,
  configEnabled,
}: {
  sales: TaxAssistantInput["transactions"];
  snapshots: TaxAssistantInput["documentTaxSnapshots"];
  defaultRate?: TaxAssistantInput["rates"][number];
  configEnabled: boolean;
}) {
  const inconsistencies: string[] = [];
  const salesWithoutSnapshot = sales.filter((sale) => !sale.hasTaxSnapshot).length;

  if (configEnabled && salesWithoutSnapshot > 0) {
    inconsistencies.push(`${salesWithoutSnapshot} sale records have no document tax snapshot.`);
  }

  if (defaultRate && snapshots.some((snapshot) => Math.abs(snapshot.rate - defaultRate.rate) > 0.01)) {
    inconsistencies.push("Some document tax snapshots use a rate different from the current default rate.");
  }

  return inconsistencies;
}

function determineConfidence({
  missingSettings,
  salesCount,
  snapshotCount,
  configEnabled,
}: {
  missingSettings: string[];
  salesCount: number;
  snapshotCount: number;
  configEnabled: boolean;
}): TaxAssistantConfidence {
  if (!configEnabled || missingSettings.length >= 3 || salesCount === 0) {
    return "insufficient_data";
  }

  if (missingSettings.length > 0 || snapshotCount === 0) {
    return "low";
  }

  if (salesCount >= 10) {
    return "high";
  }

  return "medium";
}

function buildWarnings(confidence: TaxAssistantConfidence, country: string) {
  const warnings = ["This is a recordkeeping estimate, not tax advice or filing confirmation."];

  if (country !== "NG") {
    warnings.push("Country-specific rules for this country are not configured in the Phase 3H foundation.");
  }

  if (confidence === "insufficient_data") {
    warnings.push("Complete tax settings before relying on tax estimates.");
  }

  return warnings;
}

function buildReminders(country: string, enabled: boolean) {
  if (!enabled) {
    return ["Enable tax tracking and confirm your obligations with a qualified tax professional."];
  }

  if (country === "NG") {
    return ["Review VAT records for the selected period and confirm filing obligations with a qualified tax professional."];
  }

  return ["Review tax records for the selected period with a qualified tax professional."];
}

function isInRange(date: Date, start: Date, end: Date) {
  return date >= start && date < end;
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
