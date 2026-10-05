export const loanReadinessFormulaVersion = "loan-readiness-v1";

export type LoanReadinessConfidence = "high" | "medium" | "low" | "insufficient_data";
export type LoanReadinessComponentId =
  | "business_age"
  | "revenue_consistency"
  | "profit_consistency"
  | "cashflow_stability"
  | "customer_concentration"
  | "debt_burden"
  | "record_completeness"
  | "collection_history"
  | "inventory_turnover";

export type LoanReadinessInput = {
  businessId: string;
  locationId?: string;
  businessCreatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  generatedAt?: Date;
  transactions: LoanReadinessTransaction[];
  debts: LoanReadinessDebt[];
  accounts: LoanReadinessAccount[];
  inventoryItems: LoanReadinessInventoryItem[];
};

export type LoanReadinessTransaction = {
  type: string;
  amount: number;
  profit: number;
  paymentStatus?: string | null;
  occurredAt: Date;
  category?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  inventoryItemId?: string | null;
  inventoryQuantity?: number | null;
  reversed?: boolean;
};

export type LoanReadinessDebt = {
  type: string;
  amount: number;
  paidAmount: number;
  status: string;
  dueAt?: Date | null;
  createdAt?: Date | null;
};

export type LoanReadinessAccount = {
  balance: number;
};

export type LoanReadinessInventoryItem = {
  quantityOnHand: number;
  costPrice: number;
};

export type LoanReadinessComponent = {
  id: LoanReadinessComponentId;
  label: string;
  score: number;
  weight: number;
  status: "strength" | "neutral" | "weakness" | "insufficient_data";
  explanation: string;
  sourceMetrics: Record<string, number | string | boolean | null>;
};

export type LoanReadinessAssessment = {
  businessId: string;
  locationId?: string;
  formulaVersion: typeof loanReadinessFormulaVersion;
  score: number;
  rating: "Strong records" | "Developing records" | "Needs preparation" | "Insufficient data";
  confidence: LoanReadinessConfidence;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  components: LoanReadinessComponent[];
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  dataCompleteness: Record<string, number | boolean>;
  dataWarnings: string[];
  sourceMetrics: Record<string, number | string | boolean | null>;
  disclaimer: string;
};

const weights: Record<LoanReadinessComponentId, number> = {
  business_age: 10,
  revenue_consistency: 15,
  profit_consistency: 15,
  cashflow_stability: 15,
  customer_concentration: 10,
  debt_burden: 10,
  record_completeness: 10,
  collection_history: 10,
  inventory_turnover: 5,
};

export function calculateLoanReadiness(input: LoanReadinessInput): LoanReadinessAssessment {
  const generatedAt = input.generatedAt ?? new Date();
  const transactions = input.transactions.filter(
    (transaction) => !transaction.reversed && isInRange(transaction.occurredAt, input.periodStart, input.periodEnd),
  );
  const sales = transactions.filter((transaction) => normalize(transaction.type) === "sale");
  const expenses = transactions.filter((transaction) => normalize(transaction.type) === "expense");
  const paidSales = sales.filter((transaction) => normalize(transaction.paymentStatus) === "paid");
  const creditSales = sales.filter((transaction) => normalize(transaction.paymentStatus) !== "paid");
  const revenue = sumAmounts(sales);
  const expensesTotal = sumAmounts(expenses);
  const profit = sales.reduce((sum, transaction) => sum + cleanAmount(transaction.profit), 0) - expensesTotal;
  const cash = input.accounts.reduce((sum, account) => sum + account.balance, 0);
  const businessAgeDays = daysBetween(input.businessCreatedAt, generatedAt);
  const periodDays = Math.max(1, daysBetween(input.periodStart, input.periodEnd));
  const customerDebt = openDebt(input.debts, "customer_owes_business");
  const supplierDebt = openDebt(input.debts, "business_owes_supplier");
  const overdueCustomerDebt = customerDebt.filter((debt) => debt.dueAt && debt.dueAt < generatedAt);
  const inventoryValue = input.inventoryItems.reduce(
    (sum, item) => sum + cleanAmount(item.quantityOnHand) * cleanAmount(item.costPrice),
    0,
  );
  const dataCompleteness = {
    transactionCount: transactions.length,
    salesCount: sales.length,
    expenseCount: expenses.length,
    accountCount: input.accounts.length,
    customerLinkedSales: sales.filter((transaction) => transaction.customerId).length,
    categorizedTransactions: transactions.filter((transaction) => transaction.category).length,
    inventoryItemCount: input.inventoryItems.length,
    hasEnoughHistory: businessAgeDays >= 90,
  };
  const sourceMetrics = {
    businessAgeDays,
    periodDays,
    transactionCount: transactions.length,
    revenue,
    expenses: expensesTotal,
    profit,
    cash,
    paidSales: sumAmounts(paidSales),
    creditSales: sumAmounts(creditSales),
    openCustomerDebt: sumDebt(customerDebt),
    overdueCustomerDebt: sumDebt(overdueCustomerDebt),
    openSupplierDebt: sumDebt(supplierDebt),
    inventoryValue,
    customerConcentrationPercent: customerConcentrationPercent(sales),
  };
  const components: LoanReadinessComponent[] = [
    businessAgeComponent(businessAgeDays),
    consistencyComponent("revenue_consistency", "Revenue consistency", sales, periodDays, revenue),
    profitComponent(profit, revenue, sales.length, expenses.length),
    cashflowComponent(cash, expensesTotal, periodDays, transactions.length),
    customerConcentrationComponent(sourceMetrics.customerConcentrationPercent, sales.length),
    debtBurdenComponent(sourceMetrics.openCustomerDebt, sourceMetrics.openSupplierDebt, revenue),
    recordCompletenessComponent(dataCompleteness),
    collectionHistoryComponent(sourceMetrics.overdueCustomerDebt, sourceMetrics.openCustomerDebt, creditSales.length),
    inventoryTurnoverComponent(inventoryValue, revenue, input.inventoryItems.length),
  ];
  const score = Math.round(components.reduce((sum, component) => sum + component.score, 0));
  const confidence = determineConfidence(transactions.length, businessAgeDays, input.accounts.length);
  const dataWarnings = buildWarnings(confidence, businessAgeDays, transactions.length, input.accounts.length);

  return {
    businessId: input.businessId,
    locationId: input.locationId,
    formulaVersion: loanReadinessFormulaVersion,
    score,
    rating: ratingFromScore(score, confidence),
    confidence,
    generatedAt: generatedAt.toISOString(),
    periodStart: input.periodStart.toISOString(),
    periodEnd: input.periodEnd.toISOString(),
    components,
    strengths: components.filter((component) => component.status === "strength").map((component) => component.label),
    weaknesses: components.filter((component) => component.status === "weakness").map((component) => component.label),
    recommendations: buildRecommendations(components),
    dataCompleteness,
    dataWarnings,
    sourceMetrics,
    disclaimer: "This is a loan readiness assessment from recorded SME MoneyBook data. It is not loan approval, credit advice, or a credit-bureau report.",
  };
}

function businessAgeComponent(ageDays: number): LoanReadinessComponent {
  const score = ageDays >= 365 ? 10 : ageDays >= 180 ? 8 : ageDays >= 90 ? 6 : 3;

  return {
    id: "business_age",
    label: "Business age",
    score,
    weight: weights.business_age,
    status: score >= 8 ? "strength" : score >= 6 ? "neutral" : "weakness",
    explanation: `${ageDays} days of business history are available.`,
    sourceMetrics: { ageDays },
  };
}

function consistencyComponent(
  id: "revenue_consistency",
  label: string,
  transactions: LoanReadinessTransaction[],
  periodDays: number,
  total: number,
): LoanReadinessComponent {
  const activeWeeks = new Set(transactions.map((transaction) => weekKey(transaction.occurredAt))).size;
  const expectedWeeks = Math.max(1, Math.ceil(periodDays / 7));
  const ratio = activeWeeks / expectedWeeks;
  const score = transactions.length < 8 ? 7 : Math.round(weights[id] * Math.min(1, ratio));

  return {
    id,
    label,
    score,
    weight: weights[id],
    status: score >= weights[id] * 0.75 ? "strength" : score >= weights[id] * 0.5 ? "neutral" : "weakness",
    explanation: `${activeWeeks} of ${expectedWeeks} weeks have recorded sales.`,
    sourceMetrics: { activeWeeks, expectedWeeks, transactionCount: transactions.length, total },
  };
}

function profitComponent(profit: number, revenue: number, salesCount: number, expenseCount: number): LoanReadinessComponent {
  const margin = revenue > 0 ? profit / revenue : 0;
  const score = salesCount < 8 || expenseCount < 3
    ? 8
    : margin >= 0.25
      ? 15
      : margin >= 0.1
        ? 11
        : margin >= 0
          ? 8
          : 4;

  return {
    id: "profit_consistency",
    label: "Profit consistency",
    score,
    weight: weights.profit_consistency,
    status: score >= 12 ? "strength" : score >= 8 ? "neutral" : "weakness",
    explanation: `Recorded profit margin is ${Math.round(margin * 100)}%.`,
    sourceMetrics: { profit, revenue, salesCount, expenseCount, marginPercent: Math.round(margin * 100) },
  };
}

function cashflowComponent(cash: number, expenses: number, periodDays: number, transactionCount: number): LoanReadinessComponent {
  const dailyExpense = expenses / Math.max(1, periodDays);
  const coverageDays = dailyExpense > 0 ? cash / dailyExpense : 999;
  const score = transactionCount < 10
    ? 8
    : coverageDays >= 45
      ? 15
      : coverageDays >= 21
        ? 11
        : coverageDays >= 7
          ? 8
          : 4;

  return {
    id: "cashflow_stability",
    label: "Cashflow stability",
    score,
    weight: weights.cashflow_stability,
    status: score >= 12 ? "strength" : score >= 8 ? "neutral" : "weakness",
    explanation: `Cash covers about ${Math.floor(coverageDays)} days of recent expenses.`,
    sourceMetrics: { cash, expenses, coverageDays: Math.floor(coverageDays) },
  };
}

function customerConcentrationComponent(concentrationPercent: number, salesCount: number): LoanReadinessComponent {
  const score = salesCount < 5 ? 6 : concentrationPercent <= 30 ? 10 : concentrationPercent <= 50 ? 7 : 4;

  return {
    id: "customer_concentration",
    label: "Customer concentration",
    score,
    weight: weights.customer_concentration,
    status: score >= 8 ? "strength" : score >= 6 ? "neutral" : "weakness",
    explanation: `Top customer share is ${concentrationPercent}% of linked recorded sales.`,
    sourceMetrics: { concentrationPercent, salesCount },
  };
}

function debtBurdenComponent(customerDebt: number, supplierDebt: number, revenue: number): LoanReadinessComponent {
  const netDebt = Math.max(0, supplierDebt - customerDebt);
  const ratio = revenue > 0 ? netDebt / revenue : 0;
  const score = revenue <= 0 ? 6 : ratio <= 0.1 ? 10 : ratio <= 0.3 ? 7 : 4;

  return {
    id: "debt_burden",
    label: "Debt burden",
    score,
    weight: weights.debt_burden,
    status: score >= 8 ? "strength" : score >= 6 ? "neutral" : "weakness",
    explanation: `Net supplier burden is ${Math.round(ratio * 100)}% of recorded revenue.`,
    sourceMetrics: { customerDebt, supplierDebt, netDebt, debtToRevenuePercent: Math.round(ratio * 100) },
  };
}

function recordCompletenessComponent(dataCompleteness: Record<string, number | boolean>): LoanReadinessComponent {
  const transactionCount = Number(dataCompleteness.transactionCount);
  const categorizedTransactions = Number(dataCompleteness.categorizedTransactions);
  const customerLinkedSales = Number(dataCompleteness.customerLinkedSales);
  const salesCount = Number(dataCompleteness.salesCount);
  const categoryRatio = transactionCount > 0 ? categorizedTransactions / transactionCount : 0;
  const customerRatio = salesCount > 0 ? customerLinkedSales / salesCount : 0;
  const score = Math.round(weights.record_completeness * Math.min(1, (categoryRatio + customerRatio + (dataCompleteness.accountCount ? 1 : 0)) / 3));

  return {
    id: "record_completeness",
    label: "Record completeness",
    score,
    weight: weights.record_completeness,
    status: score >= 8 ? "strength" : score >= 5 ? "neutral" : "weakness",
    explanation: "Categories, customer links, and account balances improve readiness evidence.",
    sourceMetrics: { categoryRatio, customerRatio, hasAccount: Boolean(dataCompleteness.accountCount) },
  };
}

function collectionHistoryComponent(overdueDebt: number, openDebtTotal: number, creditSaleCount: number): LoanReadinessComponent {
  const overdueRatio = openDebtTotal > 0 ? overdueDebt / openDebtTotal : 0;
  const score = openDebtTotal === 0 ? 10 : overdueRatio <= 0.15 ? 8 : overdueRatio <= 0.4 ? 6 : 3;

  return {
    id: "collection_history",
    label: "Collection history",
    score,
    weight: weights.collection_history,
    status: score >= 8 ? "strength" : score >= 6 ? "neutral" : "weakness",
    explanation: `${Math.round(overdueRatio * 100)}% of open customer debt is overdue.`,
    sourceMetrics: { overdueDebt, openDebtTotal, creditSaleCount, overduePercent: Math.round(overdueRatio * 100) },
  };
}

function inventoryTurnoverComponent(inventoryValue: number, revenue: number, itemCount: number): LoanReadinessComponent {
  const turnover = inventoryValue > 0 ? revenue / inventoryValue : 0;
  const score = itemCount === 0 ? 3 : turnover >= 1 ? 5 : turnover >= 0.35 ? 3 : 2;

  return {
    id: "inventory_turnover",
    label: "Inventory turnover",
    score,
    weight: weights.inventory_turnover,
    status: score >= 4 ? "strength" : score >= 3 ? "neutral" : "weakness",
    explanation: `Recorded revenue is ${turnover.toFixed(1)}x current inventory value.`,
    sourceMetrics: { inventoryValue, revenue, itemCount, turnover: Math.round(turnover * 10) / 10 },
  };
}

function determineConfidence(transactionCount: number, businessAgeDays: number, accountCount: number): LoanReadinessConfidence {
  if (transactionCount < 15 || businessAgeDays < 60 || accountCount === 0) {
    return "insufficient_data";
  }

  if (transactionCount >= 80 && businessAgeDays >= 180) {
    return "high";
  }

  if (transactionCount >= 35 && businessAgeDays >= 90) {
    return "medium";
  }

  return "low";
}

function buildWarnings(confidence: LoanReadinessConfidence, businessAgeDays: number, transactionCount: number, accountCount: number) {
  const warnings = ["This is not loan approval and does not guarantee credit."];

  if (confidence === "insufficient_data") {
    warnings.push("More recorded history is needed before this readiness score can be relied on.");
  }

  if (businessAgeDays < 180) {
    warnings.push("Many lenders prefer longer operating history than currently recorded.");
  }

  if (transactionCount < 35) {
    warnings.push("Record more sales, expenses, and payments to improve readiness evidence.");
  }

  if (accountCount === 0) {
    warnings.push("Add account balances so cash stability can be assessed.");
  }

  return warnings;
}

function buildRecommendations(components: LoanReadinessComponent[]) {
  return components
    .filter((component) => component.status === "weakness" || component.status === "insufficient_data")
    .slice(0, 4)
    .map((component) => {
      const actions: Record<LoanReadinessComponentId, string> = {
        business_age: "Keep recording consistently as the business operating history grows.",
        revenue_consistency: "Record sales every trading week to show reliable revenue rhythm.",
        profit_consistency: "Record expenses and product costs so profit evidence is clearer.",
        cashflow_stability: "Record account balances and reduce cash gaps before seeking financing.",
        customer_concentration: "Grow repeat sales across more customers to reduce dependency.",
        debt_burden: "Reduce supplier bills or document collections before sharing readiness reports.",
        record_completeness: "Add categories, customer links, and account balances to improve evidence quality.",
        collection_history: "Follow up overdue customers and record collections promptly.",
        inventory_turnover: "Review slow inventory and record product movement accurately.",
      };

      return actions[component.id];
    });
}

function ratingFromScore(score: number, confidence: LoanReadinessConfidence): LoanReadinessAssessment["rating"] {
  if (confidence === "insufficient_data") {
    return "Insufficient data";
  }

  if (score >= 75) {
    return "Strong records";
  }

  if (score >= 55) {
    return "Developing records";
  }

  return "Needs preparation";
}

function openDebt(debts: LoanReadinessDebt[], type: string) {
  return debts.filter((debt) => normalize(debt.status) === "open" && normalize(debt.type) === type);
}

function sumDebt(debts: LoanReadinessDebt[]) {
  return debts.reduce((sum, debt) => sum + Math.max(0, cleanAmount(debt.amount) - cleanAmount(debt.paidAmount)), 0);
}

function sumAmounts(transactions: LoanReadinessTransaction[]) {
  return transactions.reduce((sum, transaction) => sum + cleanAmount(transaction.amount), 0);
}

function customerConcentrationPercent(sales: LoanReadinessTransaction[]) {
  const byCustomer = new Map<string, number>();

  for (const sale of sales) {
    if (!sale.customerId) {
      continue;
    }

    byCustomer.set(sale.customerId, (byCustomer.get(sale.customerId) ?? 0) + cleanAmount(sale.amount));
  }

  const total = [...byCustomer.values()].reduce((sum, amount) => sum + amount, 0);
  const top = Math.max(0, ...byCustomer.values());

  return total > 0 ? Math.round((top / total) * 100) : 0;
}

function isInRange(date: Date, start: Date, end: Date) {
  return date >= start && date < end;
}

function daysBetween(start: Date, end: Date) {
  return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
}

function weekKey(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return `${date.getUTCFullYear()}-${Math.floor(daysBetween(start, date) / 7)}`;
}

function normalize(value?: string | null) {
  return (value ?? "").toLowerCase();
}

function cleanAmount(value: number | null | undefined) {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : 0;
}
