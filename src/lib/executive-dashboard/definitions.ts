export const executiveDashboardMetricVersion = "executive-dashboard-v2";
export const executiveDashboardSnapshotVersion = "executive-dashboard-snapshot-v1";

export type ExecutiveDashboardPermission =
  | "executive_dashboard:read"
  | "executive_dashboard:export"
  | "executive_dashboard:view_sensitive"
  | "executive_dashboard:view_staff_summary";

export type ExecutiveDashboardPeriodPreset =
  | "today"
  | "last_7_days"
  | "this_month"
  | "previous_month"
  | "quarter"
  | "year"
  | "custom";

export type ExecutiveDashboardDataQualityStatus =
  | "complete"
  | "partial"
  | "insufficient_data"
  | "stale"
  | "setup_required";

export type ExecutiveDashboardTrendDirection = "up" | "down" | "flat" | "new";

export type ExecutiveDashboardPeriod = {
  preset: ExecutiveDashboardPeriodPreset;
  label: string;
  start: string;
  end: string;
};

export type ExecutiveDashboardMetric<T = number> = {
  value: T;
  period: ExecutiveDashboardPeriod;
  comparisonPeriod: ExecutiveDashboardPeriod;
  comparisonValue?: T;
  change?: {
    amount: number;
    percent: number | null;
    direction: ExecutiveDashboardTrendDirection;
  };
  formulaId: string;
  sourceService: string;
  dataQualityStatus: ExecutiveDashboardDataQualityStatus;
  lastCalculatedAt: string;
  businessId: string;
  unit?: "money" | "percent" | "count" | "ratio" | "text";
  notes?: string[];
};

export type ExecutiveDashboardBreakdown = {
  label: string;
  value: number;
  count?: number;
};

export type ExecutiveDashboardAttentionItem = {
  id: string;
  severity: "critical" | "warning" | "information";
  title: string;
  detail: string;
  amount?: number;
  count?: number;
  sourceService: string;
  actionLabel: string;
  drilldownType?: ExecutiveDashboardDrilldownType;
};

export type ExecutiveDashboardDrilldownType =
  | "revenue"
  | "expenses"
  | "receivables"
  | "payables"
  | "stock"
  | "reconciliation"
  | "tax"
  | "staff";

export const executiveDashboardDrilldownTypes: ExecutiveDashboardDrilldownType[] = [
  "revenue",
  "expenses",
  "receivables",
  "payables",
  "stock",
  "reconciliation",
  "tax",
  "staff",
];

export type ExecutiveDashboardSummary = {
  metricVersion: string;
  business: {
    id: string;
    name: string;
    currency: string;
  };
  location: {
    id: string | null;
    name: string;
  };
  period: ExecutiveDashboardPeriod;
  comparisonPeriod: ExecutiveDashboardPeriod;
  generatedAt: string;
  headline: {
    sales: ExecutiveDashboardMetric;
    expenses: ExecutiveDashboardMetric;
    profit: ExecutiveDashboardMetric;
    customersOwing: ExecutiveDashboardMetric;
    supplierBills: ExecutiveDashboardMetric;
    stockValue: ExecutiveDashboardMetric;
    bankEntriesToReview: ExecutiveDashboardMetric;
    taxItemsToReview: ExecutiveDashboardMetric;
  };
  revenue: {
    totalSales: ExecutiveDashboardMetric;
    paidSales: ExecutiveDashboardMetric;
    creditSales: ExecutiveDashboardMetric;
    averageSaleValue: ExecutiveDashboardMetric;
  };
  expenses: {
    totalExpenses: ExecutiveDashboardMetric;
    categories: ExecutiveDashboardBreakdown[];
    recurringTrend: ExecutiveDashboardMetric;
  };
  profit: {
    recordedGrossProfit: ExecutiveDashboardMetric;
    estimatedNetOperatingResult: ExecutiveDashboardMetric;
    marginPercentage: ExecutiveDashboardMetric;
    assumptions: string[];
  };
  cash: {
    recordedInflows: ExecutiveDashboardMetric;
    recordedOutflows: ExecutiveDashboardMetric;
    netMovement: ExecutiveDashboardMetric;
    bankReconciledAmount: ExecutiveDashboardMetric;
    bankUnreconciledAmount: ExecutiveDashboardMetric;
    disclosure: string;
  };
  receivables: {
    totalCustomerDebt: ExecutiveDashboardMetric;
    overdueCustomerDebt: ExecutiveDashboardMetric;
    ageingBands: ExecutiveDashboardBreakdown[];
    topDebtors: ExecutiveDashboardBreakdown[];
  };
  payables: {
    supplierObligations: ExecutiveDashboardMetric;
    overdueObligations: ExecutiveDashboardMetric;
    ageingBands: ExecutiveDashboardBreakdown[];
    topSuppliers: ExecutiveDashboardBreakdown[];
  };
  stock: {
    stockCostValue: ExecutiveDashboardMetric;
    potentialRevenue: ExecutiveDashboardMetric;
    potentialProfit: ExecutiveDashboardMetric;
    lowStockItems: ExecutiveDashboardMetric;
    slowMovingItems: ExecutiveDashboardBreakdown[];
    warehouseCount: ExecutiveDashboardMetric;
    pendingTransfers: ExecutiveDashboardMetric;
  };
  staff: {
    activeStaff: ExecutiveDashboardMetric;
    salesAttributedToStaff: ExecutiveDashboardMetric;
    unattributedActivity: ExecutiveDashboardMetric;
    operationalActivity: ExecutiveDashboardMetric;
    restricted: boolean;
    disclaimer: string;
  };
  reconciliation: {
    importedAmount: ExecutiveDashboardMetric;
    matchedAmount: ExecutiveDashboardMetric;
    unmatchedAmount: ExecutiveDashboardMetric;
    duplicateAmount: ExecutiveDashboardMetric;
    reconciliationRate: ExecutiveDashboardMetric;
    unresolvedItems: ExecutiveDashboardMetric;
  };
  taxReadiness: {
    estimatedVatPosition: ExecutiveDashboardMetric;
    whtRecorded: ExecutiveDashboardMetric;
    unresolvedReviewItems: ExecutiveDashboardMetric;
    dataCompleteness: ExecutiveDashboardMetric;
    verifiedRuleSetVersion: ExecutiveDashboardMetric<string>;
  };
  healthIndicators: {
    salesTrend: ExecutiveDashboardMetric;
    expenseTrend: ExecutiveDashboardMetric;
    receivablesTrend: ExecutiveDashboardMetric;
    stockConcentration: ExecutiveDashboardMetric;
    reconciliationTrend: ExecutiveDashboardMetric;
    dataQualityTrend: ExecutiveDashboardMetric;
  };
  attentionQueue: ExecutiveDashboardAttentionItem[];
  dataQuality: {
    status: ExecutiveDashboardDataQualityStatus;
    notes: string[];
    incompleteMetricCount: number;
  };
  sourceMetrics: {
    transactionCount: number;
    saleCount: number;
    expenseCount: number;
    openDebtCount: number;
    inventoryItemCount: number;
    bankRowCount: number;
    staffMemberCount: number;
    taxReviewItemCount: number;
  };
  freshness: {
    latestTransactionAt: string | null;
    latestBankImportAt: string | null;
    generatedAt: string;
    stale: boolean;
  };
  assumptions: string[];
};

export type ExecutiveDashboardDrilldown = {
  type: ExecutiveDashboardDrilldownType;
  period: ExecutiveDashboardPeriod;
  generatedAt: string;
  rows: Array<Record<string, string | number | null>>;
  total: number;
  dataQualityStatus: ExecutiveDashboardDataQualityStatus;
};
