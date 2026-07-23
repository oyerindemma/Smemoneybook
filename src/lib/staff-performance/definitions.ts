export const staffPerformanceFormulaVersion = "staff-performance-v1";

export const staffPerformanceDisclaimer =
  "Operational activity indicator — not an employment decision.";

export type StaffPerformancePermission =
  | "staff_performance:read"
  | "staff_performance:export";

export type StaffPerformanceDatePreset =
  | "today"
  | "last_7_days"
  | "this_month"
  | "previous_month"
  | "custom";

export type StaffPerformancePeriod = {
  preset: StaffPerformanceDatePreset;
  label: string;
  periodStart: Date;
  periodEnd: Date;
};

export type StaffPerformanceMember = {
  userId: string;
  name: string;
  email?: string | null;
  role: string;
};

export type StaffPerformanceEventKind =
  | "sale"
  | "invoice"
  | "expense"
  | "debt_collection"
  | "supplier_settlement"
  | "stock_in"
  | "stock_out"
  | "transfer"
  | "reversal";

export type StaffPerformanceSourceEvent = {
  id: string;
  actorId: string | null;
  kind: StaffPerformanceEventKind;
  occurredAt: Date | string;
  amount?: number | null;
  locationId?: string | null;
  source: string;
  hasReliableAmount?: boolean;
};

export type StaffPerformanceUnattributedRecords = {
  salesTransactions: number;
  salesAmountRecords: number;
  expenses: number;
  invoices: number;
  debtCollections: number;
  supplierSettlements: number;
  stockInOperations: number;
  stockOutOperations: number;
  warehouseTransferActions: number;
  reversalsCorrections: number;
  locationUnscopedRecords: number;
};

export type StaffPerformanceMetrics = {
  salesAmountRecorded: number;
  salesTransactions: number;
  salesTransactionsWithAmount: number;
  averageTransactionValue: number;
  invoicesCreated: number;
  expensesRecorded: number;
  debtCollectionsRecorded: number;
  debtCollectionsAmount: number;
  supplierSettlementsRecorded: number;
  supplierSettlementsAmount: number;
  stockInOperations: number;
  stockOutOperations: number;
  warehouseTransferActions: number;
  reversalsCorrections: number;
  activeDays: number;
  lastRecordedActivity: string | null;
  salesContributionPercent: number;
};

export type StaffPerformanceRow = {
  staff: StaffPerformanceMember;
  metrics: StaffPerformanceMetrics;
  comparison: {
    salesAmountRecorded: number;
    salesTransactions: number;
    activeDays: number;
  };
  dataQualityNotes: string[];
};

export type StaffPerformanceSummaryCards = {
  attributedSalesAmount: number;
  salesTransactions: number;
  averageTransactionValue: number;
  activeStaff: number;
  unattributedRecords: number;
};

export type StaffPerformanceSummary = {
  formulaVersion: string;
  business: {
    id: string;
    name: string;
    currency: string;
  };
  location: {
    id: string | null;
    name: string;
  };
  period: {
    preset: StaffPerformanceDatePreset;
    label: string;
    start: string;
    end: string;
  };
  comparisonPeriod: {
    start: string;
    end: string;
  };
  generatedAt: string;
  rows: StaffPerformanceRow[];
  totals: StaffPerformanceMetrics;
  summaryCards: StaffPerformanceSummaryCards;
  unattributedRecords: StaffPerformanceUnattributedRecords;
  dataQualityNotes: string[];
  metricDefinitions: Record<keyof Omit<StaffPerformanceMetrics, "lastRecordedActivity">, string>;
  disclaimer: string;
};

export type StaffPerformanceAggregationInput = {
  business: StaffPerformanceSummary["business"];
  location?: {
    id: string | null;
    name: string;
  };
  period: StaffPerformancePeriod;
  comparisonPeriod: {
    periodStart: Date;
    periodEnd: Date;
  };
  members: StaffPerformanceMember[];
  currentEvents: StaffPerformanceSourceEvent[];
  comparisonEvents?: StaffPerformanceSourceEvent[];
  totalBusinessSalesAmount: number;
  totalBusinessSalesTransactions: number;
  unattributedRecords: StaffPerformanceUnattributedRecords;
  dataQualityNotes?: string[];
  generatedAt?: Date;
};

type MutableRow = {
  staff: StaffPerformanceMember;
  metrics: Omit<StaffPerformanceMetrics, "activeDays" | "lastRecordedActivity" | "averageTransactionValue" | "salesContributionPercent"> & {
    activeDaySet: Set<string>;
    lastRecordedActivity: Date | null;
  };
  comparison: Omit<StaffPerformanceRow["comparison"], "activeDays"> & {
    activeDaySet: Set<string>;
  };
  dataQualityNotes: Set<string>;
};

export function aggregateStaffPerformance({
  business,
  location,
  period,
  comparisonPeriod,
  members,
  currentEvents,
  comparisonEvents = [],
  totalBusinessSalesAmount,
  totalBusinessSalesTransactions,
  unattributedRecords,
  dataQualityNotes = [],
  generatedAt = new Date(),
}: StaffPerformanceAggregationInput): StaffPerformanceSummary {
  const rowsByUser = new Map<string, MutableRow>();

  for (const member of members) {
    rowsByUser.set(member.userId, createMutableRow(member));
  }

  for (const event of currentEvents) {
    applyEvent(rowsByUser, event);
  }

  for (const event of comparisonEvents) {
    applyComparisonEvent(rowsByUser, event);
  }

  const rows = Array.from(rowsByUser.values()).map((row) => finalizeRow(row, totalBusinessSalesAmount));
  const totals = calculateTotals(rows, totalBusinessSalesAmount, totalBusinessSalesTransactions);
  const unattributedRecordTotal = sumUnattributedRecords(unattributedRecords);

  return {
    formulaVersion: staffPerformanceFormulaVersion,
    business,
    location: location ?? { id: null, name: "All locations" },
    period: {
      preset: period.preset,
      label: period.label,
      start: period.periodStart.toISOString(),
      end: period.periodEnd.toISOString(),
    },
    comparisonPeriod: {
      start: comparisonPeriod.periodStart.toISOString(),
      end: comparisonPeriod.periodEnd.toISOString(),
    },
    generatedAt: generatedAt.toISOString(),
    rows,
    totals,
    summaryCards: {
      attributedSalesAmount: totals.salesAmountRecorded,
      salesTransactions: totals.salesTransactions,
      averageTransactionValue: totals.averageTransactionValue,
      activeStaff: rows.filter((row) => row.metrics.activeDays > 0).length,
      unattributedRecords: unattributedRecordTotal,
    },
    unattributedRecords,
    dataQualityNotes: Array.from(new Set(dataQualityNotes)),
    metricDefinitions: staffPerformanceMetricDefinitions,
    disclaimer: staffPerformanceDisclaimer,
  };
}

export function emptyUnattributedRecords(): StaffPerformanceUnattributedRecords {
  return {
    salesTransactions: 0,
    salesAmountRecords: 0,
    expenses: 0,
    invoices: 0,
    debtCollections: 0,
    supplierSettlements: 0,
    stockInOperations: 0,
    stockOutOperations: 0,
    warehouseTransferActions: 0,
    reversalsCorrections: 0,
    locationUnscopedRecords: 0,
  };
}

export function resolveStaffPerformancePeriod({
  preset = "this_month",
  from,
  to,
  now = new Date(),
}: {
  preset?: StaffPerformanceDatePreset | string | null;
  from?: string | null;
  to?: string | null;
  now?: Date;
}): StaffPerformancePeriod {
  const normalizedPreset = normalizePreset(preset);

  if (normalizedPreset === "custom") {
    const periodStart = parseDateBoundary(from, "start");
    const periodEnd = parseDateBoundary(to, "end");

    if (!periodStart || !periodEnd || periodEnd <= periodStart) {
      throw new Error("Choose a valid custom date range.");
    }

    assertBoundedPeriod(periodStart, periodEnd);

    return {
      preset: "custom",
      label: `${formatDateLabel(periodStart)} to ${formatDateLabel(addDays(periodEnd, -1))}`,
      periodStart,
      periodEnd,
    };
  }

  const todayStart = startOfUtcDay(now);

  if (normalizedPreset === "today") {
    return {
      preset: "today",
      label: "Today",
      periodStart: todayStart,
      periodEnd: addDays(todayStart, 1),
    };
  }

  if (normalizedPreset === "last_7_days") {
    return {
      preset: "last_7_days",
      label: "Last 7 days",
      periodStart: addDays(todayStart, -6),
      periodEnd: addDays(todayStart, 1),
    };
  }

  if (normalizedPreset === "previous_month") {
    const thisMonthStart = startOfUtcMonth(now);
    const previousMonthStart = new Date(Date.UTC(thisMonthStart.getUTCFullYear(), thisMonthStart.getUTCMonth() - 1, 1));

    return {
      preset: "previous_month",
      label: "Previous month",
      periodStart: previousMonthStart,
      periodEnd: thisMonthStart,
    };
  }

  const thisMonthStart = startOfUtcMonth(now);

  return {
    preset: "this_month",
    label: "This month",
    periodStart: thisMonthStart,
    periodEnd: new Date(Date.UTC(thisMonthStart.getUTCFullYear(), thisMonthStart.getUTCMonth() + 1, 1)),
  };
}

export function getComparisonPeriod(period: StaffPerformancePeriod) {
  const durationMs = period.periodEnd.getTime() - period.periodStart.getTime();
  const periodEnd = new Date(period.periodStart);
  const periodStart = new Date(period.periodStart.getTime() - durationMs);

  return { periodStart, periodEnd };
}

function createMutableRow(staff: StaffPerformanceMember): MutableRow {
  return {
    staff,
    metrics: {
      salesAmountRecorded: 0,
      salesTransactions: 0,
      salesTransactionsWithAmount: 0,
      invoicesCreated: 0,
      expensesRecorded: 0,
      debtCollectionsRecorded: 0,
      debtCollectionsAmount: 0,
      supplierSettlementsRecorded: 0,
      supplierSettlementsAmount: 0,
      stockInOperations: 0,
      stockOutOperations: 0,
      warehouseTransferActions: 0,
      reversalsCorrections: 0,
      activeDaySet: new Set<string>(),
      lastRecordedActivity: null,
    },
    comparison: {
      salesAmountRecorded: 0,
      salesTransactions: 0,
      activeDaySet: new Set<string>(),
    },
    dataQualityNotes: new Set<string>(),
  };
}

function applyEvent(rowsByUser: Map<string, MutableRow>, event: StaffPerformanceSourceEvent) {
  if (!event.actorId) {
    return;
  }

  const row = rowsByUser.get(event.actorId);

  if (!row) {
    return;
  }

  const occurredAt = new Date(event.occurredAt);

  if (Number.isNaN(occurredAt.getTime())) {
    return;
  }

  row.metrics.activeDaySet.add(toUtcDayKey(occurredAt));

  if (!row.metrics.lastRecordedActivity || occurredAt > row.metrics.lastRecordedActivity) {
    row.metrics.lastRecordedActivity = occurredAt;
  }

  if (event.kind === "sale") {
    row.metrics.salesTransactions += 1;

    if (event.hasReliableAmount && isFiniteNumber(event.amount)) {
      row.metrics.salesAmountRecorded += event.amount;
      row.metrics.salesTransactionsWithAmount += 1;
    } else {
      row.dataQualityNotes.add("Some sales count toward activity but do not have a staff-level amount.");
    }
  }

  if (event.kind === "invoice") {
    row.metrics.invoicesCreated += 1;
  }

  if (event.kind === "expense") {
    row.metrics.expensesRecorded += 1;
  }

  if (event.kind === "debt_collection") {
    row.metrics.debtCollectionsRecorded += 1;
    row.metrics.debtCollectionsAmount += isFiniteNumber(event.amount) ? event.amount : 0;
  }

  if (event.kind === "supplier_settlement") {
    row.metrics.supplierSettlementsRecorded += 1;
    row.metrics.supplierSettlementsAmount += isFiniteNumber(event.amount) ? event.amount : 0;
  }

  if (event.kind === "stock_in") {
    row.metrics.stockInOperations += 1;
  }

  if (event.kind === "stock_out") {
    row.metrics.stockOutOperations += 1;
  }

  if (event.kind === "transfer") {
    row.metrics.warehouseTransferActions += 1;
  }

  if (event.kind === "reversal") {
    row.metrics.reversalsCorrections += 1;
  }
}

function applyComparisonEvent(rowsByUser: Map<string, MutableRow>, event: StaffPerformanceSourceEvent) {
  if (!event.actorId) {
    return;
  }

  const row = rowsByUser.get(event.actorId);

  if (!row) {
    return;
  }

  const occurredAt = new Date(event.occurredAt);

  if (Number.isNaN(occurredAt.getTime())) {
    return;
  }

  if (event.kind === "sale") {
    row.comparison.salesTransactions += 1;

    if (event.hasReliableAmount && isFiniteNumber(event.amount)) {
      row.comparison.salesAmountRecorded += event.amount;
    }
  }

  row.comparison.activeDaySet.add(toUtcDayKey(occurredAt));
}

function finalizeRow(row: MutableRow, totalBusinessSalesAmount: number): StaffPerformanceRow {
  const activeDays = row.metrics.activeDaySet.size;
  const averageTransactionValue =
    row.metrics.salesTransactionsWithAmount > 0
      ? roundMoney(row.metrics.salesAmountRecorded / row.metrics.salesTransactionsWithAmount)
      : 0;
  const salesContributionPercent =
    totalBusinessSalesAmount > 0
      ? roundPercent((row.metrics.salesAmountRecorded / totalBusinessSalesAmount) * 100)
      : 0;

  return {
    staff: row.staff,
    metrics: {
      salesAmountRecorded: roundMoney(row.metrics.salesAmountRecorded),
      salesTransactions: row.metrics.salesTransactions,
      salesTransactionsWithAmount: row.metrics.salesTransactionsWithAmount,
      averageTransactionValue,
      invoicesCreated: row.metrics.invoicesCreated,
      expensesRecorded: row.metrics.expensesRecorded,
      debtCollectionsRecorded: row.metrics.debtCollectionsRecorded,
      debtCollectionsAmount: roundMoney(row.metrics.debtCollectionsAmount),
      supplierSettlementsRecorded: row.metrics.supplierSettlementsRecorded,
      supplierSettlementsAmount: roundMoney(row.metrics.supplierSettlementsAmount),
      stockInOperations: row.metrics.stockInOperations,
      stockOutOperations: row.metrics.stockOutOperations,
      warehouseTransferActions: row.metrics.warehouseTransferActions,
      reversalsCorrections: row.metrics.reversalsCorrections,
      activeDays,
      lastRecordedActivity: row.metrics.lastRecordedActivity?.toISOString() ?? null,
      salesContributionPercent,
    },
    comparison: {
      salesAmountRecorded: roundMoney(row.comparison.salesAmountRecorded),
      salesTransactions: row.comparison.salesTransactions,
      activeDays: row.comparison.activeDaySet.size,
    },
    dataQualityNotes: Array.from(row.dataQualityNotes),
  };
}

function calculateTotals(
  rows: StaffPerformanceRow[],
  totalBusinessSalesAmount: number,
  totalBusinessSalesTransactions: number,
): StaffPerformanceMetrics {
  const total = rows.reduce(
    (sum, row) => ({
      salesAmountRecorded: sum.salesAmountRecorded + row.metrics.salesAmountRecorded,
      salesTransactions: sum.salesTransactions + row.metrics.salesTransactions,
      salesTransactionsWithAmount: sum.salesTransactionsWithAmount + row.metrics.salesTransactionsWithAmount,
      invoicesCreated: sum.invoicesCreated + row.metrics.invoicesCreated,
      expensesRecorded: sum.expensesRecorded + row.metrics.expensesRecorded,
      debtCollectionsRecorded: sum.debtCollectionsRecorded + row.metrics.debtCollectionsRecorded,
      debtCollectionsAmount: sum.debtCollectionsAmount + row.metrics.debtCollectionsAmount,
      supplierSettlementsRecorded: sum.supplierSettlementsRecorded + row.metrics.supplierSettlementsRecorded,
      supplierSettlementsAmount: sum.supplierSettlementsAmount + row.metrics.supplierSettlementsAmount,
      stockInOperations: sum.stockInOperations + row.metrics.stockInOperations,
      stockOutOperations: sum.stockOutOperations + row.metrics.stockOutOperations,
      warehouseTransferActions: sum.warehouseTransferActions + row.metrics.warehouseTransferActions,
      reversalsCorrections: sum.reversalsCorrections + row.metrics.reversalsCorrections,
      activeDays: Math.max(sum.activeDays, row.metrics.activeDays),
      lastRecordedActivity: latestIso(sum.lastRecordedActivity, row.metrics.lastRecordedActivity),
    }),
    {
      salesAmountRecorded: 0,
      salesTransactions: 0,
      salesTransactionsWithAmount: 0,
      invoicesCreated: 0,
      expensesRecorded: 0,
      debtCollectionsRecorded: 0,
      debtCollectionsAmount: 0,
      supplierSettlementsRecorded: 0,
      supplierSettlementsAmount: 0,
      stockInOperations: 0,
      stockOutOperations: 0,
      warehouseTransferActions: 0,
      reversalsCorrections: 0,
      activeDays: 0,
      lastRecordedActivity: null as string | null,
    },
  );

  return {
    ...total,
    salesAmountRecorded: roundMoney(total.salesAmountRecorded),
    averageTransactionValue:
      total.salesTransactionsWithAmount > 0
        ? roundMoney(total.salesAmountRecorded / total.salesTransactionsWithAmount)
        : 0,
    debtCollectionsAmount: roundMoney(total.debtCollectionsAmount),
    supplierSettlementsAmount: roundMoney(total.supplierSettlementsAmount),
    salesContributionPercent:
      totalBusinessSalesAmount > 0
        ? roundPercent((total.salesAmountRecorded / totalBusinessSalesAmount) * 100)
        : totalBusinessSalesTransactions > 0
          ? 0
          : 0,
  };
}

function normalizePreset(value: StaffPerformanceDatePreset | string | null | undefined): StaffPerformanceDatePreset {
  if (
    value === "today" ||
    value === "last_7_days" ||
    value === "this_month" ||
    value === "previous_month" ||
    value === "custom"
  ) {
    return value;
  }

  if (value === "last7") {
    return "last_7_days";
  }

  return "this_month";
}

function parseDateBoundary(value: string | null | undefined, boundary: "start" | "end") {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const parsed = dateOnly ? new Date(`${trimmed}T00:00:00.000Z`) : new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return boundary === "end" && dateOnly ? addDays(parsed, 1) : parsed;
}

function assertBoundedPeriod(periodStart: Date, periodEnd: Date) {
  const maxDays = 366;
  const durationDays = (periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000);

  if (durationDays > maxDays) {
    throw new Error("Choose a date range of 366 days or less.");
  }
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function formatDateLabel(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toUtcDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function latestIso(left: string | null, right: string | null) {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return new Date(right) > new Date(left) ? right : left;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundPercent(value: number) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function sumUnattributedRecords(records: StaffPerformanceUnattributedRecords) {
  return Object.values(records).reduce((sum, value) => sum + value, 0);
}

export const staffPerformanceMetricDefinitions: Record<
  keyof Omit<StaffPerformanceMetrics, "lastRecordedActivity">,
  string
> = {
  salesAmountRecorded: "Sum of sales amounts that can be tied to a staff actor and a reliable sale amount.",
  salesTransactions: "Count of sale-recording actions attributed to the staff member in the selected period.",
  salesTransactionsWithAmount: "Count of attributed sales where the source also exposes a reliable amount.",
  averageTransactionValue: "Sales amount recorded divided by attributed sales transactions with reliable amounts.",
  invoicesCreated: "Count of issued invoice records created by the staff member.",
  expensesRecorded: "Count of expense-recording actions attributed to the staff member.",
  debtCollectionsRecorded: "Count of customer debt collection events attributed to the staff member.",
  debtCollectionsAmount: "Sum of customer debt collection amounts attributed to the staff member.",
  supplierSettlementsRecorded: "Count of supplier settlement events attributed to the staff member.",
  supplierSettlementsAmount: "Sum of supplier settlement amounts attributed to the staff member.",
  stockInOperations: "Count of stock-in inventory movements attributed to the staff member.",
  stockOutOperations: "Count of stock-out inventory movements attributed to the staff member.",
  warehouseTransferActions: "Count of transfer lifecycle actions attributed to the staff member.",
  reversalsCorrections: "Count of reversals, returns, or correction actions attributed to the staff member.",
  activeDays: "Number of calendar days in the period with at least one attributed operational event.",
  salesContributionPercent: "Attributed staff sales amount divided by total recorded business sales for the same period.",
};
