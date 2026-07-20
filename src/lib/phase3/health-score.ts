export const healthScoreFormulaVersion = "health-score-v1";

export type HealthScoreConfidence = "high" | "medium" | "low" | "insufficient_data";
export type HealthScoreStatus = "good" | "watch" | "attention" | "insufficient_data";
export type HealthScoreTrend = "improved" | "declined" | "steady" | "insufficient_data";

export type HealthScoreInput = {
  businessId: string;
  locationId?: string;
  businessCreatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  previousPeriodStart: Date;
  previousPeriodEnd: Date;
  generatedAt?: Date;
  transactions: HealthScoreTransaction[];
  debts: HealthScoreDebt[];
  accounts: HealthScoreAccount[];
  inventoryItems: HealthScoreInventoryItem[];
};

export type HealthScoreTransaction = {
  type: string;
  amount: number;
  profit: number;
  paymentStatus?: string | null;
  occurredAt: Date;
  category?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  reversed?: boolean;
};

export type HealthScoreDebt = {
  type: string;
  amount: number;
  paidAmount: number;
  status: string;
  dueAt?: Date | null;
};

export type HealthScoreAccount = {
  balance: number;
};

export type HealthScoreInventoryItem = {
  quantityOnHand: number;
  lowStockLevel: number;
  costPrice: number;
};

export type HealthScoreComponent = {
  id:
    | "recording_consistency"
    | "sales_trend"
    | "profit_trend"
    | "expense_control"
    | "cash_coverage"
    | "customer_debt_ageing"
    | "supplier_bill_ageing"
    | "inventory_health"
    | "data_completeness";
  label: string;
  score: number;
  weight: number;
  status: HealthScoreStatus;
  trend: HealthScoreTrend;
  explanation: string;
  action: string;
  sourceMetrics: Record<string, number | string | boolean>;
};

export type BusinessHealthScore = {
  businessId: string;
  locationId?: string;
  formulaVersion: typeof healthScoreFormulaVersion;
  score: number;
  rating: "Excellent" | "Good" | "Needs attention" | "Insufficient data";
  confidence: HealthScoreConfidence;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  components: HealthScoreComponent[];
  recommendations: string[];
  dataWarnings: string[];
  sourceMetrics: {
    currentTransactionCount: number;
    previousTransactionCount: number;
    currentSales: number;
    previousSales: number;
    currentExpenses: number;
    previousExpenses: number;
    currentProfit: number;
    previousProfit: number;
    cashAvailable: number;
    openCustomerDebt: number;
    overdueCustomerDebt: number;
    openSupplierBills: number;
    lowStockCount: number;
    inventoryItemCount: number;
  };
};

const weights: Record<HealthScoreComponent["id"], number> = {
  recording_consistency: 15,
  sales_trend: 15,
  profit_trend: 15,
  expense_control: 10,
  cash_coverage: 10,
  customer_debt_ageing: 10,
  supplier_bill_ageing: 5,
  inventory_health: 10,
  data_completeness: 10,
};

export function calculateBusinessHealthScore(input: HealthScoreInput): BusinessHealthScore {
  const generatedAt = input.generatedAt ?? new Date();
  const currentTransactions = activeTransactions(input.transactions).filter((transaction) =>
    isInRange(transaction.occurredAt, input.periodStart, input.periodEnd),
  );
  const previousTransactions = activeTransactions(input.transactions).filter((transaction) =>
    isInRange(transaction.occurredAt, input.previousPeriodStart, input.previousPeriodEnd),
  );
  const current = summarizeTransactions(currentTransactions);
  const previous = summarizeTransactions(previousTransactions);
  const currentSalesCount = currentTransactions.filter((transaction) => isSale(transaction.type)).length;
  const previousSalesCount = previousTransactions.filter((transaction) => isSale(transaction.type)).length;
  const cashAvailable = input.accounts.reduce((sum, account) => sum + account.balance, 0);
  const customerDebts = openDebts(input.debts, "customer");
  const supplierDebts = openDebts(input.debts, "supplier");
  const now = generatedAt;
  const overdueCustomerDebts = customerDebts.filter((debt) => debt.dueAt && debt.dueAt < now);
  const overdueSupplierDebts = supplierDebts.filter((debt) => debt.dueAt && debt.dueAt < now);
  const lowStockItems = input.inventoryItems.filter((item) => item.quantityOnHand <= item.lowStockLevel);
  const stockoutItems = input.inventoryItems.filter((item) => item.quantityOnHand <= 0);
  const periodDays = Math.max(1, daysBetween(input.periodStart, input.periodEnd));
  const businessAgeDays = Math.max(1, daysBetween(input.businessCreatedAt, generatedAt));

  const sourceMetrics = {
    currentTransactionCount: currentTransactions.length,
    previousTransactionCount: previousTransactions.length,
    currentSales: current.sales,
    previousSales: previous.sales,
    currentExpenses: current.expenses,
    previousExpenses: previous.expenses,
    currentProfit: current.profit,
    previousProfit: previous.profit,
    cashAvailable,
    openCustomerDebt: sumDebt(customerDebts),
    overdueCustomerDebt: sumDebt(overdueCustomerDebts),
    openSupplierBills: sumDebt(supplierDebts),
    lowStockCount: lowStockItems.length,
    inventoryItemCount: input.inventoryItems.length,
  };

  const components: HealthScoreComponent[] = [
    recordingConsistencyComponent(currentTransactions, periodDays, businessAgeDays),
    trendComponent({
      id: "sales_trend",
      label: "Sales trend",
      weight: weights.sales_trend,
      currentValue: current.sales,
      previousValue: previous.sales,
      currentCount: currentSalesCount,
      previousCount: previousSalesCount,
      noun: "sales",
      action: "Record sales daily so the trend becomes reliable.",
    }),
    trendComponent({
      id: "profit_trend",
      label: "Profit trend",
      weight: weights.profit_trend,
      currentValue: current.profit,
      previousValue: previous.profit,
      currentCount: currentTransactions.length,
      previousCount: previousTransactions.length,
      noun: "profit",
      action: "Review high expenses and product costs before relying on profit trend.",
    }),
    expenseControlComponent(current.sales, current.expenses),
    cashCoverageComponent(cashAvailable, current.expenses, periodDays, input.accounts.length),
    customerDebtComponent(sourceMetrics.openCustomerDebt, sourceMetrics.overdueCustomerDebt, overdueCustomerDebts.length),
    supplierBillComponent(sourceMetrics.openSupplierBills, overdueSupplierDebts.length),
    inventoryComponent(input.inventoryItems.length, lowStockItems.length, stockoutItems.length),
    dataCompletenessComponent({
      transactions: currentTransactions,
      inventoryItems: input.inventoryItems,
      hasAccounts: input.accounts.length > 0,
    }),
  ];

  const score = Math.round(components.reduce((sum, component) => sum + component.score, 0));
  const dataWarnings = buildWarnings(components, businessAgeDays, sourceMetrics);
  const recommendations = buildRecommendations(components);
  const confidence = confidenceFromComponents(components, currentTransactions.length, businessAgeDays);

  return {
    businessId: input.businessId,
    locationId: input.locationId,
    formulaVersion: healthScoreFormulaVersion,
    score,
    rating: ratingFromScore(score, confidence),
    confidence,
    generatedAt: generatedAt.toISOString(),
    periodStart: input.periodStart.toISOString(),
    periodEnd: input.periodEnd.toISOString(),
    components,
    recommendations,
    dataWarnings,
    sourceMetrics,
  };
}

function recordingConsistencyComponent(
  transactions: HealthScoreTransaction[],
  periodDays: number,
  businessAgeDays: number,
): HealthScoreComponent {
  const activeDays = new Set(transactions.map((transaction) => transaction.occurredAt.toISOString().slice(0, 10))).size;
  const targetDays = Math.max(1, Math.min(periodDays, businessAgeDays, 20));

  if (businessAgeDays < 14 && transactions.length < 5) {
    return {
      id: "recording_consistency",
      label: "Recording consistency",
      score: 11,
      weight: weights.recording_consistency,
      status: "insufficient_data",
      trend: "insufficient_data",
      explanation: "This business is still new, so the score does not penalize limited history yet.",
      action: "Record sales or expenses for a few more days to unlock a stronger consistency score.",
      sourceMetrics: { activeDays, targetDays, businessAgeDays, transactionCount: transactions.length },
    };
  }

  const ratio = Math.min(1, activeDays / targetDays);
  return {
    id: "recording_consistency",
    label: "Recording consistency",
    score: Math.round(weights.recording_consistency * ratio),
    weight: weights.recording_consistency,
    status: ratio >= 0.7 ? "good" : ratio >= 0.35 ? "watch" : "attention",
    trend: "steady",
    explanation: `${activeDays} of ${targetDays} expected recording days have activity.`,
    action: ratio >= 0.7 ? "Keep recording daily." : "Record at least one sale or expense each business day.",
    sourceMetrics: { activeDays, targetDays, transactionCount: transactions.length },
  };
}

function trendComponent(input: {
  id: "sales_trend" | "profit_trend";
  label: string;
  weight: number;
  currentValue: number;
  previousValue: number;
  currentCount: number;
  previousCount: number;
  noun: string;
  action: string;
}): HealthScoreComponent {
  if (input.currentCount < 5 || input.previousCount < 5) {
    return {
      id: input.id,
      label: input.label,
      score: Math.round(input.weight * 0.67),
      weight: input.weight,
      status: "insufficient_data",
      trend: "insufficient_data",
      explanation: `Not enough ${input.noun} history exists for a reliable comparison.`,
      action: input.action,
      sourceMetrics: {
        currentValue: input.currentValue,
        previousValue: input.previousValue,
        currentCount: input.currentCount,
        previousCount: input.previousCount,
      },
    };
  }

  const change = input.previousValue === 0
    ? input.currentValue > 0 ? 1 : 0
    : (input.currentValue - input.previousValue) / Math.abs(input.previousValue);
  const score = change >= 0 ? input.weight : change > -0.2 ? Math.round(input.weight * 0.67) : Math.round(input.weight * 0.34);

  return {
    id: input.id,
    label: input.label,
    score,
    weight: input.weight,
    status: change >= 0 ? "good" : change > -0.2 ? "watch" : "attention",
    trend: change > 0.05 ? "improved" : change < -0.05 ? "declined" : "steady",
    explanation: `${input.label} changed by ${Math.round(change * 100)}% versus the previous period.`,
    action: change >= 0 ? "Keep the current rhythm." : input.action,
    sourceMetrics: {
      currentValue: input.currentValue,
      previousValue: input.previousValue,
      percentChange: Math.round(change * 100),
    },
  };
}

function expenseControlComponent(sales: number, expenses: number): HealthScoreComponent {
  if (sales <= 0) {
    return {
      id: "expense_control",
      label: "Expense control",
      score: 6,
      weight: weights.expense_control,
      status: "insufficient_data",
      trend: "insufficient_data",
      explanation: "No recorded sales in the period, so expense control cannot be judged strongly.",
      action: "Record sales and expenses consistently to compare spending against income.",
      sourceMetrics: { sales, expenses },
    };
  }

  const ratio = expenses / sales;
  const score = ratio <= 0.4 ? 10 : ratio <= 0.7 ? 7 : 4;
  return {
    id: "expense_control",
    label: "Expense control",
    score,
    weight: weights.expense_control,
    status: ratio <= 0.4 ? "good" : ratio <= 0.7 ? "watch" : "attention",
    trend: "steady",
    explanation: `Expenses are ${Math.round(ratio * 100)}% of recorded sales.`,
    action: ratio <= 0.7 ? "Keep reviewing expenses weekly." : "Review large expenses and categories before the next purchase.",
    sourceMetrics: { sales, expenses, expenseToSalesPercent: Math.round(ratio * 100) },
  };
}

function cashCoverageComponent(
  cashAvailable: number,
  expenses: number,
  periodDays: number,
  accountCount: number,
): HealthScoreComponent {
  if (accountCount === 0) {
    return {
      id: "cash_coverage",
      label: "Cash coverage",
      score: 5,
      weight: weights.cash_coverage,
      status: "insufficient_data",
      trend: "insufficient_data",
      explanation: "No accounts are available for a cash coverage check.",
      action: "Add or update a cash, bank, or mobile-money account balance.",
      sourceMetrics: { cashAvailable, accountCount },
    };
  }

  const averageDailyExpense = expenses > 0 ? expenses / periodDays : 0;
  const coverageDays = averageDailyExpense > 0 ? cashAvailable / averageDailyExpense : cashAvailable > 0 ? 30 : 0;
  const score = coverageDays >= 30 ? 10 : coverageDays >= 14 ? 8 : coverageDays >= 7 ? 6 : 3;

  return {
    id: "cash_coverage",
    label: "Cash coverage",
    score,
    weight: weights.cash_coverage,
    status: coverageDays >= 14 ? "good" : coverageDays >= 7 ? "watch" : "attention",
    trend: "steady",
    explanation: `Recorded cash covers about ${Math.round(coverageDays)} day${Math.round(coverageDays) === 1 ? "" : "s"} of recent expenses.`,
    action: coverageDays >= 14 ? "Keep balances updated." : "Collect overdue money or reduce short-term spending.",
    sourceMetrics: { cashAvailable, averageDailyExpense: Math.round(averageDailyExpense), coverageDays: Math.round(coverageDays) },
  };
}

function customerDebtComponent(openDebt: number, overdueDebt: number, overdueCount: number): HealthScoreComponent {
  if (openDebt <= 0) {
    return {
      id: "customer_debt_ageing",
      label: "Customer debt",
      score: 10,
      weight: weights.customer_debt_ageing,
      status: "good",
      trend: "steady",
      explanation: "No open customer debt is recorded.",
      action: "Keep collecting on time.",
      sourceMetrics: { openDebt, overdueDebt, overdueCount },
    };
  }

  const overdueRatio = overdueDebt / openDebt;
  const score = overdueDebt <= 0 ? 8 : overdueRatio <= 0.3 ? 5 : 2;

  return {
    id: "customer_debt_ageing",
    label: "Customer debt",
    score,
    weight: weights.customer_debt_ageing,
    status: overdueDebt <= 0 ? "watch" : overdueRatio <= 0.3 ? "watch" : "attention",
    trend: overdueDebt > 0 ? "declined" : "steady",
    explanation: overdueDebt > 0
      ? `${overdueCount} overdue customer debt${overdueCount === 1 ? "" : "s"} total ${formatPlainAmount(overdueDebt)}.`
      : `Open customer debt totals ${formatPlainAmount(openDebt)}, with none overdue.`,
    action: overdueDebt > 0 ? "Send reminders to overdue customers." : "Follow up before debts become overdue.",
    sourceMetrics: { openDebt, overdueDebt, overdueCount },
  };
}

function supplierBillComponent(openBills: number, overdueCount: number): HealthScoreComponent {
  if (openBills <= 0) {
    return {
      id: "supplier_bill_ageing",
      label: "Supplier bills",
      score: 5,
      weight: weights.supplier_bill_ageing,
      status: "good",
      trend: "steady",
      explanation: "No open supplier bills are recorded.",
      action: "Keep supplier bills updated.",
      sourceMetrics: { openBills, overdueCount },
    };
  }

  return {
    id: "supplier_bill_ageing",
    label: "Supplier bills",
    score: overdueCount > 0 ? 2 : 3,
    weight: weights.supplier_bill_ageing,
    status: overdueCount > 0 ? "attention" : "watch",
    trend: overdueCount > 0 ? "declined" : "steady",
    explanation: overdueCount > 0
      ? `${overdueCount} supplier bill${overdueCount === 1 ? "" : "s"} are overdue.`
      : `Open supplier bills total ${formatPlainAmount(openBills)}.`,
    action: overdueCount > 0 ? "Plan supplier payments before ordering more stock." : "Schedule payment dates for open supplier bills.",
    sourceMetrics: { openBills, overdueCount },
  };
}

function inventoryComponent(itemCount: number, lowStockCount: number, stockoutCount: number): HealthScoreComponent {
  if (itemCount === 0) {
    return {
      id: "inventory_health",
      label: "Inventory",
      score: 7,
      weight: weights.inventory_health,
      status: "insufficient_data",
      trend: "insufficient_data",
      explanation: "No inventory items are recorded, so stock health is neutral.",
      action: "Add products to unlock inventory health scoring.",
      sourceMetrics: { itemCount, lowStockCount, stockoutCount },
    };
  }

  const lowStockRatio = lowStockCount / itemCount;
  const score = stockoutCount > 0 ? 2 : lowStockRatio <= 0.1 ? 10 : lowStockRatio <= 0.25 ? 7 : 4;
  return {
    id: "inventory_health",
    label: "Inventory",
    score,
    weight: weights.inventory_health,
    status: score >= 8 ? "good" : score >= 5 ? "watch" : "attention",
    trend: score >= 8 ? "steady" : "declined",
    explanation: `${lowStockCount} of ${itemCount} item${itemCount === 1 ? "" : "s"} are low in stock.`,
    action: lowStockCount > 0 ? "Restock low items or update low-stock levels." : "Keep stock levels updated.",
    sourceMetrics: { itemCount, lowStockCount, stockoutCount },
  };
}

function dataCompletenessComponent(input: {
  transactions: HealthScoreTransaction[];
  inventoryItems: HealthScoreInventoryItem[];
  hasAccounts: boolean;
}): HealthScoreComponent {
  const missingCategory = input.transactions.filter(
    (transaction) => (isSale(transaction.type) || isExpense(transaction.type)) && !transaction.category,
  ).length;
  const missingParty = input.transactions.filter(
    (transaction) => (isSale(transaction.type) && !transaction.customerId) || (isExpense(transaction.type) && !transaction.supplierId),
  ).length;
  const missingCost = input.inventoryItems.filter((item) => item.costPrice <= 0).length;
  const checks = [
    missingCategory === 0,
    missingParty === 0,
    missingCost === 0,
    input.hasAccounts,
  ];
  const score = Math.round((checks.filter(Boolean).length / checks.length) * weights.data_completeness);

  return {
    id: "data_completeness",
    label: "Data completeness",
    score,
    weight: weights.data_completeness,
    status: score >= 8 ? "good" : score >= 5 ? "watch" : "attention",
    trend: "steady",
    explanation: `${checks.filter(Boolean).length} of ${checks.length} completeness checks passed.`,
    action: score >= 8 ? "Keep records complete." : "Add missing categories, parties, costs, or account balances.",
    sourceMetrics: { missingCategory, missingParty, missingCost, hasAccounts: input.hasAccounts },
  };
}

function buildWarnings(
  components: HealthScoreComponent[],
  businessAgeDays: number,
  metrics: BusinessHealthScore["sourceMetrics"],
) {
  const warnings = components
    .filter((component) => component.status === "insufficient_data")
    .map((component) => `${component.label}: ${component.explanation}`);

  if (businessAgeDays < 14) {
    warnings.push("New business: limited history is treated gently and predictive claims are avoided.");
  }

  if (metrics.currentTransactionCount < 5) {
    warnings.push("Minimum data threshold not met for strong trend scoring.");
  }

  return Array.from(new Set(warnings));
}

function buildRecommendations(components: HealthScoreComponent[]) {
  return components
    .filter((component) => component.status === "attention" || component.status === "watch")
    .sort((first, second) => second.weight - first.weight)
    .map((component) => component.action)
    .filter((action, index, actions) => actions.indexOf(action) === index)
    .slice(0, 4);
}

function confidenceFromComponents(
  components: HealthScoreComponent[],
  currentTransactionCount: number,
  businessAgeDays: number,
): HealthScoreConfidence {
  if (currentTransactionCount === 0) {
    return "insufficient_data";
  }

  const insufficientCount = components.filter((component) => component.status === "insufficient_data").length;

  if (businessAgeDays < 14 || currentTransactionCount < 5 || insufficientCount >= 3) {
    return "low";
  }

  if (insufficientCount > 0) {
    return "medium";
  }

  return "high";
}

function ratingFromScore(score: number, confidence: HealthScoreConfidence): BusinessHealthScore["rating"] {
  if (confidence === "insufficient_data") {
    return "Insufficient data";
  }

  if (score >= 80) {
    return "Excellent";
  }

  if (score >= 60) {
    return "Good";
  }

  return "Needs attention";
}

function summarizeTransactions(transactions: HealthScoreTransaction[]) {
  return transactions.reduce(
    (summary, transaction) => {
      if (isSale(transaction.type)) {
        summary.sales += paidAmount(transaction);
      }

      if (isExpense(transaction.type)) {
        summary.expenses += paidAmount(transaction);
      }

      summary.profit += transaction.profit;
      return summary;
    },
    { sales: 0, expenses: 0, profit: 0 },
  );
}

function activeTransactions(transactions: HealthScoreTransaction[]) {
  return transactions.filter((transaction) => !transaction.reversed);
}

function openDebts(debts: HealthScoreDebt[], kind: "customer" | "supplier") {
  return debts.filter((debt) => {
    const type = debt.type.toLowerCase();
    const status = debt.status.toLowerCase();
    const remaining = debt.amount - debt.paidAmount;
    return remaining > 0 && status === "open" && (kind === "customer"
      ? type.includes("customer")
      : type.includes("supplier"));
  });
}

function sumDebt(debts: HealthScoreDebt[]) {
  return debts.reduce((sum, debt) => sum + Math.max(0, debt.amount - debt.paidAmount), 0);
}

function isSale(type: string) {
  return type.toLowerCase() === "sale";
}

function isExpense(type: string) {
  return type.toLowerCase() === "expense";
}

function paidAmount(transaction: HealthScoreTransaction) {
  return transaction.paymentStatus?.toLowerCase() === "credit" ? 0 : transaction.amount;
}

function isInRange(date: Date, start: Date, end: Date) {
  return date >= start && date < end;
}

function daysBetween(start: Date, end: Date) {
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
}

function formatPlainAmount(amount: number) {
  return `NGN ${Math.round(amount).toLocaleString("en-NG")}`;
}
