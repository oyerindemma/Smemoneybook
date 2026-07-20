export const cashflowForecastFormulaVersion = "cashflow-forecast-v1";

export const cashflowForecastHorizons = [7, 30, 90] as const;

export type CashflowHorizonDays = (typeof cashflowForecastHorizons)[number];
export type CashflowForecastConfidence = "high" | "medium" | "low" | "insufficient_data";

export type CashflowForecastInput = {
  businessId: string;
  locationId?: string;
  businessCreatedAt: Date;
  periodStart: Date;
  recordedThrough: Date;
  generatedAt?: Date;
  horizons?: CashflowHorizonDays[];
  transactions: CashflowForecastTransaction[];
  debts: CashflowForecastDebt[];
  accounts: CashflowForecastAccount[];
};

export type CashflowForecastTransaction = {
  type: string;
  amount: number;
  paymentStatus?: string | null;
  occurredAt: Date;
  description?: string | null;
  category?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  reversed?: boolean;
};

export type CashflowForecastDebt = {
  type: string;
  amount: number;
  paidAmount: number;
  status: string;
  dueAt?: Date | null;
  createdAt?: Date | null;
  customerId?: string | null;
  supplierId?: string | null;
};

export type CashflowForecastAccount = {
  balance: number;
};

export type CashflowForecastAlert = {
  type:
    | "expected_cash_shortage"
    | "expenses_growing_faster_than_income"
    | "large_supplier_obligations"
    | "low_cash_coverage"
    | "customer_concentration";
  severity: "info" | "warning" | "critical";
  message: string;
  sourceMetrics: Record<string, number | string | boolean>;
};

export type CashflowForecastSeriesPoint = {
  kind: "forecast";
  periodStart: string;
  periodEnd: string;
  projectedInflows: number;
  projectedOutflows: number;
  projectedEndingCash: number;
};

export type CashflowBacktestResult = {
  available: boolean;
  horizonDays: CashflowHorizonDays;
  trainingStart?: string;
  forecastedPeriodStart?: string;
  forecastedPeriodEnd?: string;
  predictedNetCashMovement?: number;
  actualNetCashMovement?: number;
  absoluteError?: number;
  accuracyPercent?: number;
  reason?: string;
};

export type CashflowRecordedMetrics = {
  historyDays: number;
  activeTransactionCount: number;
  cashTransactionCount: number;
  paidSales: number;
  paidExpenses: number;
  netCashMovement: number;
  creditSales: number;
  unpaidExpenses: number;
  currentCash: number;
  latestTransactionAt?: string;
  dataFreshnessDays: number | null;
};

export type CashflowForecast = {
  horizonDays: CashflowHorizonDays;
  confidence: CashflowForecastConfidence;
  forecastStart: string;
  forecastEnd: string;
  openingCash: number;
  projectedInflows: number;
  projectedOutflows: number;
  projectedNetCash: number;
  forecastEndingCash: number;
  lowerBound: number;
  upperBound: number;
  historicalInflows: number;
  historicalOutflows: number;
  expectedCustomerPayments: number;
  supplierObligations: number;
  recurringExpenseFloor: number;
  assumptions: string[];
  alerts: CashflowForecastAlert[];
  dataWarnings: string[];
  recordedMetrics: CashflowRecordedMetrics;
  forecastSeries: CashflowForecastSeriesPoint[];
  sourceMetrics: Record<string, number | string | boolean | null>;
  backtest: CashflowBacktestResult;
};

export type CashflowForecastSummary = {
  businessId: string;
  locationId?: string;
  formulaVersion: typeof cashflowForecastFormulaVersion;
  generatedAt: string;
  periodStart: string;
  recordedThrough: string;
  currentCash: number;
  recordedMetrics: CashflowRecordedMetrics;
  dataWarnings: string[];
  sourceMetrics: Record<string, number | string | boolean | null>;
  forecasts: CashflowForecast[];
};

type CashflowMovement = {
  transaction: CashflowForecastTransaction;
  inflow: number;
  outflow: number;
  net: number;
};

type CashflowSummary = {
  inflows: number;
  outflows: number;
  net: number;
  transactionCount: number;
  paidSalesCount: number;
  paidExpenseCount: number;
};

const dayMs = 86_400_000;

const minimums: Record<CashflowHorizonDays, { historyDays: number; cashTransactions: number }> = {
  7: { historyDays: 30, cashTransactions: 8 },
  30: { historyDays: 60, cashTransactions: 15 },
  90: { historyDays: 120, cashTransactions: 30 },
};

export function calculateCashflowForecast(input: CashflowForecastInput): CashflowForecastSummary {
  const generatedAt = input.generatedAt ?? new Date();
  const horizons = input.horizons?.length ? input.horizons : [...cashflowForecastHorizons];
  const active = activeTransactions(input.transactions).filter((transaction) =>
    isInRange(transaction.occurredAt, input.periodStart, input.recordedThrough),
  );
  const cashMovements = active.flatMap(toCashMovement);
  const currentCash = roundMoney(input.accounts.reduce((sum, account) => sum + account.balance, 0));
  const latestTransaction = active.reduce<Date | undefined>((latest, transaction) => {
    if (!latest || transaction.occurredAt > latest) {
      return transaction.occurredAt;
    }

    return latest;
  }, undefined);
  const historyDays = Math.max(
    0,
    Math.min(
      daysBetween(input.businessCreatedAt, input.recordedThrough),
      daysBetween(input.periodStart, input.recordedThrough),
    ),
  );
  const recordedSummary = summarizeCashMovements(cashMovements);
  const recordedMetrics: CashflowRecordedMetrics = {
    historyDays,
    activeTransactionCount: active.length,
    cashTransactionCount: cashMovements.length,
    paidSales: recordedSummary.inflows,
    paidExpenses: recordedSummary.outflows,
    netCashMovement: recordedSummary.net,
    creditSales: roundMoney(
      active
        .filter((transaction) => isSale(transaction.type) && normalize(transaction.paymentStatus) !== "paid")
        .reduce((sum, transaction) => sum + cleanAmount(transaction.amount), 0),
    ),
    unpaidExpenses: roundMoney(
      active
        .filter((transaction) => isExpense(transaction.type) && normalize(transaction.paymentStatus) !== "paid")
        .reduce((sum, transaction) => sum + cleanAmount(transaction.amount), 0),
    ),
    currentCash,
    latestTransactionAt: latestTransaction?.toISOString(),
    dataFreshnessDays: latestTransaction ? daysBetween(latestTransaction, generatedAt) : null,
  };

  const debtMetrics = summarizeDebts(input.debts, input.recordedThrough);
  const summaryWarnings = buildSummaryWarnings({
    accountCount: input.accounts.length,
    locationScoped: Boolean(input.locationId),
    recordedMetrics,
    debtMetrics,
  });
  const sourceMetrics = {
    ...recordedMetrics,
    accountCount: input.accounts.length,
    openCustomerDebt: debtMetrics.openCustomerDebt,
    openSupplierDebt: debtMetrics.openSupplierDebt,
    overdueCustomerDebt: debtMetrics.overdueCustomerDebt,
    overdueSupplierDebt: debtMetrics.overdueSupplierDebt,
    customerDebtsWithoutDueDate: debtMetrics.customerDebtsWithoutDueDate,
    supplierDebtsWithoutDueDate: debtMetrics.supplierDebtsWithoutDueDate,
  };

  const forecasts = horizons.map((horizonDays) =>
    buildForecast({
      input,
      horizonDays,
      generatedAt,
      activeTransactions: active,
      cashMovements,
      recordedMetrics,
      debtMetrics,
      currentCash,
      historyDays,
    }),
  );

  return {
    businessId: input.businessId,
    locationId: input.locationId,
    formulaVersion: cashflowForecastFormulaVersion,
    generatedAt: generatedAt.toISOString(),
    periodStart: input.periodStart.toISOString(),
    recordedThrough: input.recordedThrough.toISOString(),
    currentCash,
    recordedMetrics,
    dataWarnings: summaryWarnings,
    sourceMetrics,
    forecasts,
  };
}

function buildForecast({
  input,
  horizonDays,
  activeTransactions,
  cashMovements,
  recordedMetrics,
  debtMetrics,
  currentCash,
  historyDays,
}: {
  input: CashflowForecastInput;
  horizonDays: CashflowHorizonDays;
  generatedAt: Date;
  activeTransactions: CashflowForecastTransaction[];
  cashMovements: CashflowMovement[];
  recordedMetrics: CashflowRecordedMetrics;
  debtMetrics: ReturnType<typeof summarizeDebts>;
  currentCash: number;
  historyDays: number;
}): CashflowForecast {
  const forecastStart = input.recordedThrough;
  const forecastEnd = addDays(forecastStart, horizonDays);
  const minimum = minimums[horizonDays];
  const longWindowDays = Math.max(1, Math.min(historyDays, Math.max(horizonDays * 3, 30)));
  const recentWindowDays = Math.max(1, Math.min(historyDays, 30));
  const longWindowStart = addDays(input.recordedThrough, -longWindowDays);
  const recentWindowStart = addDays(input.recordedThrough, -recentWindowDays);
  const longSummary = summarizeCashMovements(
    cashMovements.filter((movement) => movement.transaction.occurredAt >= longWindowStart),
  );
  const recentSummary = summarizeCashMovements(
    cashMovements.filter((movement) => movement.transaction.occurredAt >= recentWindowStart),
  );
  const longDailyInflows = longSummary.inflows / longWindowDays;
  const longDailyOutflows = longSummary.outflows / longWindowDays;
  const recentDailyInflows = recentSummary.inflows / recentWindowDays;
  const recentDailyOutflows = recentSummary.outflows / recentWindowDays;
  const weightedDailyInflows = weightedRate(recentDailyInflows, longDailyInflows, recentSummary.paidSalesCount);
  const weightedDailyOutflows = weightedRate(recentDailyOutflows, longDailyOutflows, recentSummary.paidExpenseCount);
  const historicalInflows = roundMoney(weightedDailyInflows * horizonDays);
  const historicalOutflows = roundMoney(weightedDailyOutflows * horizonDays);
  const upcomingCustomerDebts = dueDebts(debtMetrics.openCustomerDebts, forecastEnd);
  const upcomingSupplierDebts = dueDebts(debtMetrics.openSupplierDebts, forecastEnd);
  const expectedCustomerPayments = roundMoney(sumRemainingDebt(upcomingCustomerDebts));
  const supplierObligations = roundMoney(sumRemainingDebt(upcomingSupplierDebts));
  const recurringExpenseFloor = roundMoney(projectRecurringExpenses(activeTransactions, horizonDays));
  const projectedInflows = roundMoney(historicalInflows + expectedCustomerPayments);
  const projectedOutflowsBeforeDebts = Math.max(historicalOutflows, recurringExpenseFloor);
  const projectedOutflows = roundMoney(projectedOutflowsBeforeDebts + supplierObligations);
  const projectedNetCash = roundMoney(projectedInflows - projectedOutflows);
  const forecastEndingCash = roundMoney(currentCash + projectedNetCash);
  const dailyNetStdDev = dailyNetStandardDeviation(cashMovements, longWindowStart, input.recordedThrough);
  const backtest = backtestForecast(input, horizonDays);
  const confidence = determineConfidence({
    horizonDays,
    historyDays,
    cashTransactionCount: recordedMetrics.cashTransactionCount,
    latestDataFreshnessDays: recordedMetrics.dataFreshnessDays,
    accountCount: input.accounts.length,
    backtest,
  });
  const rangePadding = calculateRangePadding({
    projectedNetCash,
    dailyNetStdDev,
    horizonDays,
    confidence,
  });
  const lowerBound = roundMoney(forecastEndingCash - rangePadding);
  const upperBound = roundMoney(forecastEndingCash + rangePadding);
  const concentration = calculateCustomerConcentration(activeTransactions, debtMetrics.openCustomerDebts);
  const sourceMetrics = {
    minHistoryDays: minimum.historyDays,
    minCashTransactionCount: minimum.cashTransactions,
    historyDays,
    cashTransactionCount: recordedMetrics.cashTransactionCount,
    longWindowDays,
    recentWindowDays,
    longDailyInflows: roundMoney(longDailyInflows),
    longDailyOutflows: roundMoney(longDailyOutflows),
    recentDailyInflows: roundMoney(recentDailyInflows),
    recentDailyOutflows: roundMoney(recentDailyOutflows),
    weightedDailyInflows: roundMoney(weightedDailyInflows),
    weightedDailyOutflows: roundMoney(weightedDailyOutflows),
    dailyNetStdDev: roundMoney(dailyNetStdDev),
    expectedCustomerPayments,
    supplierObligations,
    recurringExpenseFloor,
    overdueCustomerDebtIncluded: roundMoney(sumRemainingDebt(debtMetrics.openCustomerDebts.filter((debt) => isOverdue(debt, input.recordedThrough)))),
    overdueSupplierDebtIncluded: roundMoney(sumRemainingDebt(debtMetrics.openSupplierDebts.filter((debt) => isOverdue(debt, input.recordedThrough)))),
    customerConcentrationShare: concentration.share,
    backtestAccuracyPercent: backtest.accuracyPercent ?? null,
  };
  const assumptions = buildAssumptions({
    horizonDays,
    historyDays,
    locationScoped: Boolean(input.locationId),
    hasSeasonality: historyDays >= 365,
    recurringExpenseFloor,
  });
  const dataWarnings = buildForecastWarnings({
    confidence,
    horizonDays,
    minimum,
    historyDays,
    recordedMetrics,
    debtMetrics,
    locationScoped: Boolean(input.locationId),
  });
  const alerts = buildAlerts({
    horizonDays,
    forecastEndingCash,
    lowerBound,
    currentCash,
    projectedInflows,
    projectedOutflows,
    supplierObligations,
    weightedDailyInflows,
    weightedDailyOutflows,
    longDailyInflows,
    longDailyOutflows,
    concentration,
  });
  const forecastSeries = buildForecastSeries({
    forecastStart,
    horizonDays,
    openingCash: currentCash,
    dailyInflows: projectedInflows / horizonDays,
    dailyOutflows: projectedOutflows / horizonDays,
  });

  return {
    horizonDays,
    confidence,
    forecastStart: forecastStart.toISOString(),
    forecastEnd: forecastEnd.toISOString(),
    openingCash: currentCash,
    projectedInflows,
    projectedOutflows,
    projectedNetCash,
    forecastEndingCash,
    lowerBound,
    upperBound,
    historicalInflows,
    historicalOutflows,
    expectedCustomerPayments,
    supplierObligations,
    recurringExpenseFloor,
    assumptions,
    alerts,
    dataWarnings,
    recordedMetrics,
    forecastSeries,
    sourceMetrics,
    backtest,
  };
}

function buildSummaryWarnings({
  accountCount,
  locationScoped,
  recordedMetrics,
  debtMetrics,
}: {
  accountCount: number;
  locationScoped: boolean;
  recordedMetrics: CashflowRecordedMetrics;
  debtMetrics: ReturnType<typeof summarizeDebts>;
}) {
  const warnings: string[] = [];

  if (accountCount === 0) {
    warnings.push("No cash or bank account balance is recorded, so opening cash is treated as zero.");
  }

  if (recordedMetrics.latestTransactionAt && recordedMetrics.dataFreshnessDays !== null && recordedMetrics.dataFreshnessDays > 7) {
    warnings.push(`Latest recorded transaction is ${recordedMetrics.dataFreshnessDays} days old.`);
  }

  if (!recordedMetrics.latestTransactionAt) {
    warnings.push("No transaction history is available for cashflow forecasting yet.");
  }

  if (debtMetrics.customerDebtsWithoutDueDate > 0 || debtMetrics.supplierDebtsWithoutDueDate > 0) {
    warnings.push("Some open customer or supplier debts have no due date and are excluded from dated payment projections.");
  }

  if (locationScoped) {
    warnings.push("Location forecasts use location transactions, but opening cash uses business-level account balances because accounts are not location-specific.");
  }

  return warnings;
}

function buildForecastWarnings({
  confidence,
  horizonDays,
  minimum,
  historyDays,
  recordedMetrics,
  debtMetrics,
  locationScoped,
}: {
  confidence: CashflowForecastConfidence;
  horizonDays: CashflowHorizonDays;
  minimum: { historyDays: number; cashTransactions: number };
  historyDays: number;
  recordedMetrics: CashflowRecordedMetrics;
  debtMetrics: ReturnType<typeof summarizeDebts>;
  locationScoped: boolean;
}) {
  const warnings: string[] = [];

  if (confidence === "insufficient_data") {
    warnings.push(
      `${horizonDays}-day forecast needs at least ${minimum.historyDays} days of history and ${minimum.cashTransactions} paid cash transactions.`,
    );
  }

  if (historyDays < minimum.historyDays) {
    warnings.push(`Only ${historyDays} days of usable history are available for this horizon.`);
  }

  if (recordedMetrics.cashTransactionCount < minimum.cashTransactions) {
    warnings.push(`Only ${recordedMetrics.cashTransactionCount} paid cash transactions are available for this horizon.`);
  }

  if (recordedMetrics.dataFreshnessDays !== null && recordedMetrics.dataFreshnessDays > 7) {
    warnings.push("Forecast confidence is reduced because recent activity has not been recorded.");
  }

  if (debtMetrics.overdueCustomerDebt > 0) {
    warnings.push("Overdue customer debts are included by due date but may not be collected on schedule.");
  }

  if (locationScoped) {
    warnings.push("Cash balance is not location-specific in the current ledger model.");
  }

  warnings.push("Cashflow forecasts are estimates based on recorded SME MoneyBook data, not guarantees.");

  return [...new Set(warnings)];
}

function buildAssumptions({
  horizonDays,
  historyDays,
  locationScoped,
  hasSeasonality,
  recurringExpenseFloor,
}: {
  horizonDays: CashflowHorizonDays;
  historyDays: number;
  locationScoped: boolean;
  hasSeasonality: boolean;
  recurringExpenseFloor: number;
}) {
  const assumptions = [
    `Forecast covers the next ${horizonDays} days from the latest recorded date.`,
    "Historical cash movement uses paid sales and paid expenses only.",
    "Credit sales and unpaid expenses are included only when open debts have due dates.",
    "Recent 30-day activity is weighted more heavily than older activity.",
  ];

  if (recurringExpenseFloor > 0) {
    assumptions.push("Repeated expense descriptions or categories are used as a recurring-expense floor.");
  }

  assumptions.push(
    hasSeasonality
      ? "At least one year of history exists; seasonal patterns can be reviewed against source metrics."
      : "No seasonal adjustment is applied until at least one year of history exists.",
  );

  if (historyDays < 30) {
    assumptions.push("The business is still building enough history, so confidence is deliberately conservative.");
  }

  if (locationScoped) {
    assumptions.push("Location scope filters transactions and debts; account balances remain business-wide.");
  }

  return assumptions;
}

function buildAlerts({
  horizonDays,
  forecastEndingCash,
  lowerBound,
  currentCash,
  projectedInflows,
  projectedOutflows,
  supplierObligations,
  weightedDailyInflows,
  weightedDailyOutflows,
  longDailyInflows,
  longDailyOutflows,
  concentration,
}: {
  horizonDays: CashflowHorizonDays;
  forecastEndingCash: number;
  lowerBound: number;
  currentCash: number;
  projectedInflows: number;
  projectedOutflows: number;
  supplierObligations: number;
  weightedDailyInflows: number;
  weightedDailyOutflows: number;
  longDailyInflows: number;
  longDailyOutflows: number;
  concentration: { customerId?: string; share: number; amount: number };
}) {
  const alerts: CashflowForecastAlert[] = [];

  if (forecastEndingCash < 0 || lowerBound < 0) {
    alerts.push({
      type: "expected_cash_shortage",
      severity: forecastEndingCash < 0 ? "critical" : "warning",
      message: `Cash may fall below zero within ${horizonDays} days.`,
      sourceMetrics: { forecastEndingCash, lowerBound, currentCash },
    });
  }

  const inflowGrowth = percentChange(longDailyInflows, weightedDailyInflows);
  const outflowGrowth = percentChange(longDailyOutflows, weightedDailyOutflows);
  if (outflowGrowth - inflowGrowth > 0.2 && projectedOutflows > 0) {
    alerts.push({
      type: "expenses_growing_faster_than_income",
      severity: "warning",
      message: "Recent expenses are rising faster than recent cash income.",
      sourceMetrics: {
        inflowGrowthPercent: roundPercent(inflowGrowth),
        outflowGrowthPercent: roundPercent(outflowGrowth),
        weightedDailyInflows: roundMoney(weightedDailyInflows),
        weightedDailyOutflows: roundMoney(weightedDailyOutflows),
      },
    });
  }

  if (supplierObligations > 0 && supplierObligations >= Math.max(currentCash * 0.3, projectedInflows * 0.5)) {
    alerts.push({
      type: "large_supplier_obligations",
      severity: "warning",
      message: "Upcoming supplier obligations are large compared with cash or expected inflows.",
      sourceMetrics: { supplierObligations, currentCash, projectedInflows },
    });
  }

  const cashCoverageDays = weightedDailyOutflows > 0 ? currentCash / weightedDailyOutflows : Number.POSITIVE_INFINITY;
  if (Number.isFinite(cashCoverageDays) && cashCoverageDays < Math.min(14, horizonDays)) {
    alerts.push({
      type: "low_cash_coverage",
      severity: cashCoverageDays < 7 ? "critical" : "warning",
      message: "Current cash covers only a short period of projected outflows.",
      sourceMetrics: { cashCoverageDays: Math.floor(cashCoverageDays), weightedDailyOutflows: roundMoney(weightedDailyOutflows) },
    });
  }

  if (concentration.share >= 0.5 && concentration.amount > 0) {
    alerts.push({
      type: "customer_concentration",
      severity: concentration.share >= 0.7 ? "critical" : "warning",
      message: "Expected cash relies heavily on one customer.",
      sourceMetrics: {
        customerId: concentration.customerId ?? "unknown",
        customerSharePercent: roundPercent(concentration.share),
        customerAmount: concentration.amount,
      },
    });
  }

  return alerts;
}

function determineConfidence({
  horizonDays,
  historyDays,
  cashTransactionCount,
  latestDataFreshnessDays,
  accountCount,
  backtest,
}: {
  horizonDays: CashflowHorizonDays;
  historyDays: number;
  cashTransactionCount: number;
  latestDataFreshnessDays: number | null;
  accountCount: number;
  backtest: CashflowBacktestResult;
}): CashflowForecastConfidence {
  const minimum = minimums[horizonDays];

  if (historyDays < minimum.historyDays || cashTransactionCount < minimum.cashTransactions || accountCount === 0) {
    return "insufficient_data";
  }

  let score = 0;
  score += Math.min(2, historyDays / minimum.historyDays);
  score += Math.min(2, cashTransactionCount / minimum.cashTransactions);

  if (latestDataFreshnessDays === null || latestDataFreshnessDays > 14) {
    score -= 1;
  } else if (latestDataFreshnessDays <= 3) {
    score += 0.5;
  }

  if (backtest.available && typeof backtest.accuracyPercent === "number") {
    if (backtest.accuracyPercent >= 80) {
      score += 1;
    } else if (backtest.accuracyPercent < 50) {
      score -= 1;
    }
  }

  if (score >= 4.5) {
    return "high";
  }

  if (score >= 3) {
    return "medium";
  }

  return "low";
}

function calculateRangePadding({
  projectedNetCash,
  dailyNetStdDev,
  horizonDays,
  confidence,
}: {
  projectedNetCash: number;
  dailyNetStdDev: number;
  horizonDays: CashflowHorizonDays;
  confidence: CashflowForecastConfidence;
}) {
  const confidencePadding = {
    high: 0.15,
    medium: 0.25,
    low: 0.4,
    insufficient_data: 0.6,
  }[confidence];
  const volatilityPadding = dailyNetStdDev * Math.sqrt(horizonDays);

  return roundMoney(Math.max(Math.abs(projectedNetCash) * confidencePadding, volatilityPadding));
}

function buildForecastSeries({
  forecastStart,
  horizonDays,
  openingCash,
  dailyInflows,
  dailyOutflows,
}: {
  forecastStart: Date;
  horizonDays: CashflowHorizonDays;
  openingCash: number;
  dailyInflows: number;
  dailyOutflows: number;
}) {
  const bucketDays = horizonDays <= 7 ? 1 : horizonDays <= 30 ? 7 : 15;
  const series: CashflowForecastSeriesPoint[] = [];
  let cursor = forecastStart;
  let remainingDays = horizonDays;
  let runningCash = openingCash;

  while (remainingDays > 0) {
    const days = Math.min(bucketDays, remainingDays);
    const periodStart = cursor;
    const periodEnd = addDays(cursor, days);
    const projectedInflows = roundMoney(dailyInflows * days);
    const projectedOutflows = roundMoney(dailyOutflows * days);
    runningCash = roundMoney(runningCash + projectedInflows - projectedOutflows);

    series.push({
      kind: "forecast",
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      projectedInflows,
      projectedOutflows,
      projectedEndingCash: runningCash,
    });

    cursor = periodEnd;
    remainingDays -= days;
  }

  return series;
}

function backtestForecast(input: CashflowForecastInput, horizonDays: CashflowHorizonDays): CashflowBacktestResult {
  const minimum = minimums[horizonDays];
  const forecastedPeriodEnd = input.recordedThrough;
  const forecastedPeriodStart = addDays(forecastedPeriodEnd, -horizonDays);
  const trainingDays = Math.max(horizonDays * 3, 30);
  const trainingStart = addDays(forecastedPeriodStart, -trainingDays);
  const trainingMovements = activeTransactions(input.transactions)
    .filter((transaction) => isInRange(transaction.occurredAt, trainingStart, forecastedPeriodStart))
    .flatMap(toCashMovement);
  const actualMovements = activeTransactions(input.transactions)
    .filter((transaction) => isInRange(transaction.occurredAt, forecastedPeriodStart, forecastedPeriodEnd))
    .flatMap(toCashMovement);

  if (trainingMovements.length < Math.max(4, Math.floor(minimum.cashTransactions / 2)) || actualMovements.length === 0) {
    return {
      available: false,
      horizonDays,
      trainingStart: trainingStart.toISOString(),
      forecastedPeriodStart: forecastedPeriodStart.toISOString(),
      forecastedPeriodEnd: forecastedPeriodEnd.toISOString(),
      reason: "Not enough historical paid cash movement exists for backtesting this horizon.",
    };
  }

  const trainingSummary = summarizeCashMovements(trainingMovements);
  const actualSummary = summarizeCashMovements(actualMovements);
  const predictedNetCashMovement = roundMoney((trainingSummary.net / trainingDays) * horizonDays);
  const actualNetCashMovement = actualSummary.net;
  const absoluteError = roundMoney(Math.abs(predictedNetCashMovement - actualNetCashMovement));
  const denominator = Math.max(Math.abs(actualNetCashMovement), Math.abs(predictedNetCashMovement), 1);
  const accuracyPercent = Math.max(0, roundPercent(1 - absoluteError / denominator));

  return {
    available: true,
    horizonDays,
    trainingStart: trainingStart.toISOString(),
    forecastedPeriodStart: forecastedPeriodStart.toISOString(),
    forecastedPeriodEnd: forecastedPeriodEnd.toISOString(),
    predictedNetCashMovement,
    actualNetCashMovement,
    absoluteError,
    accuracyPercent,
  };
}

function activeTransactions(transactions: CashflowForecastTransaction[]) {
  return transactions.filter((transaction) => !transaction.reversed);
}

function toCashMovement(transaction: CashflowForecastTransaction): CashflowMovement[] {
  const amount = cleanAmount(transaction.amount);
  const paymentStatus = normalize(transaction.paymentStatus);

  if (amount <= 0 || paymentStatus !== "paid") {
    return [];
  }

  if (isSale(transaction.type)) {
    return [{ transaction, inflow: amount, outflow: 0, net: amount }];
  }

  if (isExpense(transaction.type)) {
    return [{ transaction, inflow: 0, outflow: amount, net: -amount }];
  }

  return [];
}

function summarizeCashMovements(movements: CashflowMovement[]): CashflowSummary {
  const summary = movements.reduce(
    (current, movement) => ({
      inflows: current.inflows + movement.inflow,
      outflows: current.outflows + movement.outflow,
      net: current.net + movement.net,
      transactionCount: current.transactionCount + 1,
      paidSalesCount: current.paidSalesCount + (movement.inflow > 0 ? 1 : 0),
      paidExpenseCount: current.paidExpenseCount + (movement.outflow > 0 ? 1 : 0),
    }),
    { inflows: 0, outflows: 0, net: 0, transactionCount: 0, paidSalesCount: 0, paidExpenseCount: 0 },
  );

  return {
    inflows: roundMoney(summary.inflows),
    outflows: roundMoney(summary.outflows),
    net: roundMoney(summary.net),
    transactionCount: summary.transactionCount,
    paidSalesCount: summary.paidSalesCount,
    paidExpenseCount: summary.paidExpenseCount,
  };
}

function summarizeDebts(debts: CashflowForecastDebt[], recordedThrough: Date) {
  const openDebts = debts.filter((debt) => normalize(debt.status) === "open" && remainingDebt(debt) > 0);
  const openCustomerDebts = openDebts.filter((debt) => isCustomerDebt(debt.type));
  const openSupplierDebts = openDebts.filter((debt) => isSupplierDebt(debt.type));

  return {
    openCustomerDebts,
    openSupplierDebts,
    openCustomerDebt: roundMoney(sumRemainingDebt(openCustomerDebts)),
    openSupplierDebt: roundMoney(sumRemainingDebt(openSupplierDebts)),
    overdueCustomerDebt: roundMoney(sumRemainingDebt(openCustomerDebts.filter((debt) => isOverdue(debt, recordedThrough)))),
    overdueSupplierDebt: roundMoney(sumRemainingDebt(openSupplierDebts.filter((debt) => isOverdue(debt, recordedThrough)))),
    customerDebtsWithoutDueDate: openCustomerDebts.filter((debt) => !debt.dueAt).length,
    supplierDebtsWithoutDueDate: openSupplierDebts.filter((debt) => !debt.dueAt).length,
  };
}

function dueDebts(debts: CashflowForecastDebt[], forecastEnd: Date) {
  return debts.filter((debt) => debt.dueAt && debt.dueAt <= forecastEnd);
}

function sumRemainingDebt(debts: CashflowForecastDebt[]) {
  return debts.reduce((sum, debt) => sum + remainingDebt(debt), 0);
}

function remainingDebt(debt: CashflowForecastDebt) {
  return Math.max(0, cleanAmount(debt.amount) - cleanAmount(debt.paidAmount));
}

function isOverdue(debt: CashflowForecastDebt, now: Date) {
  return Boolean(debt.dueAt && debt.dueAt < now);
}

function projectRecurringExpenses(transactions: CashflowForecastTransaction[], horizonDays: CashflowHorizonDays) {
  const groups = new Map<string, CashflowForecastTransaction[]>();

  for (const transaction of transactions) {
    if (!isExpense(transaction.type) || normalize(transaction.paymentStatus) !== "paid" || cleanAmount(transaction.amount) <= 0) {
      continue;
    }

    const key = normalizeRecurringKey(transaction);
    const current = groups.get(key) ?? [];
    current.push(transaction);
    groups.set(key, current);
  }

  let projected = 0;
  for (const group of groups.values()) {
    const ordered = [...group].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());

    if (ordered.length < 2) {
      continue;
    }

    const spanDays = Math.max(1, daysBetween(ordered[0].occurredAt, ordered[ordered.length - 1].occurredAt));
    const averageIntervalDays = spanDays / Math.max(1, ordered.length - 1);

    if (averageIntervalDays < 5 || averageIntervalDays > 45) {
      continue;
    }

    const averageAmount = ordered.reduce((sum, transaction) => sum + cleanAmount(transaction.amount), 0) / ordered.length;
    const expectedOccurrences = Math.floor(horizonDays / averageIntervalDays);
    projected += averageAmount * expectedOccurrences;
  }

  return projected;
}

function normalizeRecurringKey(transaction: CashflowForecastTransaction) {
  const text = transaction.category || transaction.description || "uncategorized";
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function calculateCustomerConcentration(
  transactions: CashflowForecastTransaction[],
  customerDebts: CashflowForecastDebt[],
) {
  const byCustomer = new Map<string, number>();

  for (const transaction of transactions) {
    if (!transaction.customerId || !isSale(transaction.type)) {
      continue;
    }

    byCustomer.set(
      transaction.customerId,
      (byCustomer.get(transaction.customerId) ?? 0) + cleanAmount(transaction.amount),
    );
  }

  for (const debt of customerDebts) {
    if (!debt.customerId) {
      continue;
    }

    byCustomer.set(debt.customerId, (byCustomer.get(debt.customerId) ?? 0) + remainingDebt(debt));
  }

  const total = [...byCustomer.values()].reduce((sum, amount) => sum + amount, 0);
  let topCustomerId: string | undefined;
  let topAmount = 0;

  for (const [customerId, amount] of byCustomer) {
    if (amount > topAmount) {
      topCustomerId = customerId;
      topAmount = amount;
    }
  }

  return {
    customerId: topCustomerId,
    amount: roundMoney(topAmount),
    share: total > 0 ? roundPercent(topAmount / total) / 100 : 0,
  };
}

function dailyNetStandardDeviation(cashMovements: CashflowMovement[], periodStart: Date, periodEnd: Date) {
  const days = Math.max(1, daysBetween(periodStart, periodEnd));
  const buckets = new Map<string, number>();

  for (let index = 0; index < days; index += 1) {
    buckets.set(addDays(periodStart, index).toISOString().slice(0, 10), 0);
  }

  for (const movement of cashMovements) {
    if (!isInRange(movement.transaction.occurredAt, periodStart, periodEnd)) {
      continue;
    }

    const key = movement.transaction.occurredAt.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + movement.net);
  }

  const values = [...buckets.values()];
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;

  return Math.sqrt(variance);
}

function weightedRate(recentRate: number, longRate: number, recentCount: number) {
  if (recentCount < 3) {
    return longRate;
  }

  return recentRate * 0.6 + longRate * 0.4;
}

function percentChange(previous: number, current: number) {
  if (previous === 0) {
    return current > 0 ? 1 : 0;
  }

  return (current - previous) / Math.abs(previous);
}

function isInRange(date: Date, start: Date, end: Date) {
  return date >= start && date < end;
}

function daysBetween(start: Date, end: Date) {
  return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / dayMs));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * dayMs);
}

function isSale(type: string) {
  return normalize(type) === "sale";
}

function isExpense(type: string) {
  return normalize(type) === "expense";
}

function isCustomerDebt(type: string) {
  return normalize(type) === "customer_owes_business";
}

function isSupplierDebt(type: string) {
  return normalize(type) === "business_owes_supplier";
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

function roundPercent(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 10000) / 100;
}
