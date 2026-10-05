export const predictiveAlertsRuleVersion = "predictive-alerts-v2";

export type PredictiveAlertCategory =
  | "cash_flow_pressure"
  | "unusual_expense_increase"
  | "sales_decline"
  | "customer_debt_risk"
  | "supplier_payment_pressure"
  | "low_stock"
  | "stock_out_risk"
  | "slow_moving_stock"
  | "reconciliation_backlog"
  | "duplicate_bank_entries"
  | "tax_readiness_issues"
  | "missing_data_risk"
  | "staff_attribution_anomalies"
  | "subscription_or_setup_risks";

export type PredictiveAlertSeverity = "critical" | "high" | "medium" | "low" | "information";
export type PredictiveAlertLegacySeverity = "critical" | "warning" | "info";
export type PredictiveAlertLifecycleStatus = "active" | "acknowledged" | "resolved" | "dismissed";
export type PredictiveAlertPermission =
  | "predictive_alerts:read"
  | "predictive_alerts:manage"
  | "predictive_alerts:acknowledge"
  | "predictive_alerts:export";
export type PredictiveAlertDeliveryChannel = "in_app" | "email" | "whatsapp";

export type PredictiveAlertPeriod = {
  label: string;
  start: string;
  end: string;
  comparisonStart?: string;
  comparisonEnd?: string;
};

export type PredictiveAlertEvidence = {
  whatChanged: string;
  comparedPeriod: string;
  metricValues: Record<string, number | string | boolean | null>;
  threshold: Record<string, number | string | boolean | null>;
  formula: string;
  sourceData: string[];
  missingData: string[];
  recommendedReviewAction: string;
  disclaimer?: string;
};

export type PredictiveAlertRuleDefinition = {
  key: string;
  category: PredictiveAlertCategory;
  version: string;
  defaultSeverity: PredictiveAlertSeverity;
  thresholdConfig: Record<string, number | string | boolean>;
  requiredHistoryDays: number;
  enabled: boolean;
  title: string;
  description: string;
  formulaReference: string;
  formula: string;
  sourceData: string[];
  minimumData: string;
  suppression: string;
  resolution: string;
  dedupeWindowDays: number;
};

export type BusinessAlertPreferenceInput = {
  ruleKey: string;
  enabled?: boolean;
  severityOverride?: PredictiveAlertSeverity | null;
  thresholdOverride?: Record<string, number | string | boolean | null> | null;
  inAppEnabled?: boolean;
  emailEnabled?: boolean;
  whatsappEnabled?: boolean;
};

export type PredictiveAlertTransactionSignal = {
  id: string;
  type: string;
  amount: number;
  profit?: number;
  costOfGoods?: number;
  description?: string | null;
  category?: string | null;
  paymentStatus?: string | null;
  occurredAt: Date | string;
  locationId?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  inventoryItemId?: string | null;
  inventoryItemName?: string | null;
  inventoryQuantity?: number | null;
  reversed?: boolean;
};

export type PredictiveAlertDebtSignal = {
  id?: string;
  type: string;
  amount: number;
  paidAmount: number;
  status: string;
  dueAt?: Date | string | null;
  createdAt?: Date | string | null;
  customerId?: string | null;
  customerName?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
};

export type PredictiveAlertInventorySignal = {
  id: string;
  name: string;
  quantityOnHand: number;
  lowStockLevel: number;
  costPrice: number;
  sellingPrice: number;
};

export type PredictiveAlertBankRowSignal = {
  id: string;
  amount: number;
  status: string;
  duplicateStatus: string;
  postedAt: Date | string;
  importedAt?: Date | string | null;
};

export type PredictiveAlertTaxReviewSignal = {
  id: string;
  issueType: string;
  severity: string;
  status: string;
  explanation: string;
  createdAt: Date | string;
};

export type PredictiveAlertStaffAttributionSignal = {
  totalActivityCount: number;
  attributedActivityCount: number;
  unattributedActivityCount: number;
  totalSalesAmount: number;
  attributedSalesAmount: number;
  dataQualityNotes: string[];
};

export type PredictiveAlertSetupSignal = {
  onboardingCompleted: boolean;
  planId: string;
  hasPredictiveAlertsEntitlement: boolean;
  taxProfileConfigured: boolean;
  bankImportCount: number;
};

export type PredictiveAlertInput = {
  businessId: string;
  locationId?: string;
  generatedAt?: Date;
  periodDays?: number;
  transactions: PredictiveAlertTransactionSignal[];
  debts: PredictiveAlertDebtSignal[];
  inventoryItems: PredictiveAlertInventorySignal[];
  bankRows: PredictiveAlertBankRowSignal[];
  taxReviewItems: PredictiveAlertTaxReviewSignal[];
  staffAttribution?: PredictiveAlertStaffAttributionSignal;
  setup?: PredictiveAlertSetupSignal;
  preferences?: BusinessAlertPreferenceInput[];
};

export type PredictiveAlertCandidate = {
  ruleKey: string;
  category: PredictiveAlertCategory;
  severity: PredictiveAlertSeverity;
  title: string;
  explanation: string;
  recommendedAction: string;
  evidence: PredictiveAlertEvidence;
  period: PredictiveAlertPeriod;
  impactAmount: number;
  confidence: number;
  formulaReference: string;
  dedupeKey: string;
  sourceMetrics: Record<string, number | string | boolean | null>;
  missingData: string[];
  delivery: {
    inApp: boolean;
    email: boolean;
    whatsapp: boolean;
  };
};

export type PredictiveAlertRecord = PredictiveAlertCandidate & {
  id: string;
  businessId: string;
  locationId?: string;
  alertKey: string;
  lifecycleStatus: PredictiveAlertLifecycleStatus;
  legacyStatus: string;
  legacySeverity: PredictiveAlertLegacySeverity;
  firstDetectedAt: string;
  lastDetectedAt: string;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt?: string;
  acknowledgedByUserId?: string;
  dismissedAt?: string;
  dismissedReason?: string;
  resolvedAt?: string;
  resolutionNote?: string;
  deliveryCount: number;
};

export const defaultPredictiveAlertRules: PredictiveAlertRuleDefinition[] = [
  rule("sales_decline", "sales_decline", "high", 60, {
    minimumTransactions: 2,
    minimumPreviousSales: 20_000,
    minimumDropAmount: 20_000,
    dropPercent: 30,
  }, "Recorded sales declined against a comparable prior period.", "predictive.sales_decline.v2", "previousSales - currentSales >= minimumDropAmount and dropPercent >= threshold"),
  rule("expense_spike", "unusual_expense_increase", "medium", 60, {
    minimumTransactions: 2,
    minimumIncreaseAmount: 25_000,
    increasePercent: 40,
  }, "Recorded expenses increased materially against the baseline.", "predictive.expense_spike.v2", "currentExpenses - previousExpenses >= minimumIncreaseAmount and increasePercent >= threshold"),
  rule("receivables_concentration", "customer_debt_risk", "medium", 1, {
    minimumDebtAmount: 25_000,
    concentrationPercent: 45,
  }, "Open customer debt is concentrated in one customer.", "predictive.receivables_concentration.v2", "largestCustomerDebt / totalCustomerDebt >= threshold"),
  rule("overdue_debt_increase", "customer_debt_risk", "high", 60, {
    minimumOverdueAmount: 25_000,
    minimumIncreaseAmount: 15_000,
    increasePercent: 25,
  }, "Overdue customer debt increased or remains material.", "predictive.overdue_debt_increase.v2", "currentOverdueDebt - comparisonOverdueDebt >= threshold or currentOverdueDebt is material"),
  rule("supplier_payment_pressure", "supplier_payment_pressure", "medium", 1, {
    minimumSupplierObligations: 25_000,
    dueSoonDays: 7,
  }, "Supplier obligations are overdue or coming due soon.", "predictive.supplier_payment_pressure.v2", "overdueSupplierDebt + dueSoonSupplierDebt >= threshold"),
  rule("low_stock_risk", "low_stock", "medium", 7, {
    minimumStockValue: 5_000,
  }, "Current stock is at or below the reorder threshold.", "predictive.low_stock_risk.v2", "quantityOnHand <= lowStockLevel and stockValue >= threshold"),
  rule("stock_out_forecast", "stock_out_risk", "high", 30, {
    forecastDays: 7,
    minimumSalesQuantity: 2,
  }, "Trailing sales velocity indicates possible stock-out risk.", "predictive.stock_out_forecast.v2", "quantityOnHand / trailingDailySalesVelocity <= forecastDays"),
  rule("slow_moving_stock", "slow_moving_stock", "low", 30, {
    minimumStockValue: 25_000,
    lookbackDays: 30,
  }, "High-value stock has not sold in the trailing period.", "predictive.slow_moving_stock.v2", "stockValue >= threshold and trailingSalesQuantity = 0"),
  rule("reconciliation_backlog", "reconciliation_backlog", "medium", 30, {
    minimumUnresolvedRows: 3,
    minimumUnresolvedAmount: 50_000,
    minimumAgeDays: 7,
  }, "Imported bank rows remain unresolved or stale.", "predictive.reconciliation_backlog.v2", "unresolvedRows >= threshold or unresolvedAmount >= threshold or oldestAgeDays >= threshold"),
  rule("duplicate_import_risk", "duplicate_bank_entries", "medium", 30, {
    minimumDuplicateRows: 1,
    minimumDuplicateAmount: 10_000,
  }, "Bank imports contain duplicate or probable duplicate rows.", "predictive.duplicate_import_risk.v2", "duplicateRows >= threshold or duplicateAmount >= threshold"),
  rule("tax_readiness_gap", "tax_readiness_issues", "medium", 30, {
    minimumOpenItems: 1,
    criticalItemWeight: 2,
  }, "Tax review items or setup gaps need attention.", "predictive.tax_readiness_gap.v2", "openTaxReviewItems >= threshold or criticalTaxItems > 0"),
  rule("missing_data_risk", "missing_data_risk", "medium", 30, {
    minimumAmount: 25_000,
    missingDataPercent: 25,
  }, "Large amounts are missing categories, counterparties, or source detail.", "predictive.missing_data_risk.v2", "missingDataAmount / totalRecordedAmount >= threshold and missingDataAmount >= minimumAmount"),
  rule("staff_attribution_anomaly", "staff_attribution_anomalies", "low", 30, {
    minimumTransactions: 3,
    minimumUnattributedPercent: 50,
  }, "Operational activity has weak staff attribution.", "predictive.staff_attribution_anomaly.v2", "unattributedActivity / totalActivity >= threshold"),
  rule("cash_pressure_indicator", "cash_flow_pressure", "high", 30, {
    minimumPressureAmount: 30_000,
    supplierWeight: 1,
  }, "Recorded inflows may not cover recorded outflows and obligations.", "predictive.cash_pressure_indicator.v2", "recordedOutflows + supplierObligations - recordedInflows - overdueReceivablesCredit >= threshold"),
  rule("subscription_setup_risk", "subscription_or_setup_risks", "information", 1, {
    requiresOnboardingComplete: true,
  }, "Business setup or subscription state may block reliable alerts.", "predictive.subscription_setup_risk.v2", "required setup signals are missing"),
];

function rule(
  key: string,
  category: PredictiveAlertCategory,
  defaultSeverity: PredictiveAlertSeverity,
  requiredHistoryDays: number,
  thresholdConfig: Record<string, number | string | boolean>,
  description: string,
  formulaReference: string,
  formula: string,
): PredictiveAlertRuleDefinition {
  return {
    key,
    category,
    version: predictiveAlertsRuleVersion,
    defaultSeverity,
    thresholdConfig,
    requiredHistoryDays,
    enabled: true,
    title: labelFromKey(key),
    description,
    formulaReference,
    formula,
    sourceData: defaultSourceData(category),
    minimumData: `Requires ${requiredHistoryDays} day(s) of relevant recorded source data where applicable.`,
    suppression: "Suppressed when source data is insufficient, the rule is disabled, or thresholds are not met.",
    resolution: "Resolved automatically when the deterministic condition is no longer detected on evaluation.",
    dedupeWindowDays: 7,
  };
}

function labelFromKey(key: string) {
  return key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function defaultSourceData(category: PredictiveAlertCategory) {
  if (category === "tax_readiness_issues") {
    return ["TaxReviewItem", "BusinessTaxProfile"];
  }

  if (category === "reconciliation_backlog" || category === "duplicate_bank_entries") {
    return ["BankStatementImportRow", "BankStatementImport"];
  }

  if (category.includes("stock")) {
    return ["InventoryItem", "Transaction"];
  }

  if (category === "staff_attribution_anomalies") {
    return ["StaffPerformance", "AuditLog"];
  }

  if (category === "subscription_or_setup_risks") {
    return ["Business", "Subscription"];
  }

  return ["Transaction", "Debt"];
}
