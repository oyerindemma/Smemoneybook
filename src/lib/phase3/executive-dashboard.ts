export const executiveDashboardFormulaVersion = "executive-dashboard-v1";

export type ExecutiveDashboardTransaction = {
  type: "sale" | "expense" | string;
  amount: number;
  profit?: number;
  costOfGoods?: number;
  occurredAt: Date | string;
  locationId?: string | null;
  inventoryItemId?: string | null;
  productName?: string | null;
};

export type ExecutiveDashboardDebt = {
  type: "customer_owes_business" | "business_owes_supplier" | string;
  amount: number;
  paidAmount?: number;
  status: "open" | "settled" | string;
  dueAt?: Date | string | null;
};

export type ExecutiveDashboardInventoryItem = {
  id: string;
  name: string;
  quantityOnHand: number;
  costPrice: number;
  sellingPrice: number;
};

export type ExecutiveDashboardLocation = {
  id: string;
  name: string;
};

export type ExecutiveDashboardSummary = {
  formulaVersion: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  summary: {
    revenue: number;
    expenses: number;
    profit: number;
    cashAvailable: number;
    outstandingCustomerDebt: number;
    supplierBills: number;
    stockCostValue: number;
    potentialRevenue: number;
    grossMarginPercent: number | null;
    bestProducts: Array<{ itemId: string; name: string; quantitySold: number; revenue: number }>;
    slowProducts: Array<{ itemId: string; name: string; quantityOnHand: number; stockCostValue: number }>;
    locationComparison: Array<{ locationId: string; name: string; revenue: number; expenses: number; profit: number }>;
  };
  recommendedActions: string[];
  sourceMetrics: {
    transactionCount: number;
    saleCount: number;
    expenseCount: number;
    debtCount: number;
    inventoryItemCount: number;
  };
  freshness: {
    latestTransactionAt: string | null;
    generatedAt: string;
  };
};

export function calculateExecutiveDashboard({
  transactions,
  debts,
  inventoryItems,
  accounts,
  locations,
  periodStart,
  periodEnd,
  generatedAt = new Date(),
}: {
  transactions: ExecutiveDashboardTransaction[];
  debts: ExecutiveDashboardDebt[];
  inventoryItems: ExecutiveDashboardInventoryItem[];
  accounts: Array<{ balance: number }>;
  locations: ExecutiveDashboardLocation[];
  periodStart: Date;
  periodEnd: Date;
  generatedAt?: Date;
}): ExecutiveDashboardSummary {
  const periodTransactions = transactions.filter((transaction) => {
    const occurredAt = new Date(transaction.occurredAt);
    return occurredAt >= periodStart && occurredAt < periodEnd;
  });
  const sales = periodTransactions.filter((transaction) => transaction.type === "sale");
  const expenses = periodTransactions.filter((transaction) => transaction.type === "expense");
  const revenue = sumMoney(sales.map((transaction) => transaction.amount));
  const expenseTotal = sumMoney(expenses.map((transaction) => transaction.amount));
  const grossProfit = sumMoney(sales.map((transaction) => transaction.profit ?? transaction.amount - (transaction.costOfGoods ?? 0)));
  const profit = grossProfit - expenseTotal;
  const cashAvailable = sumMoney(accounts.map((account) => account.balance));
  const openDebts = debts.filter((debt) => debt.status === "open");
  const outstandingCustomerDebt = sumMoney(
    openDebts
      .filter((debt) => debt.type === "customer_owes_business")
      .map((debt) => Math.max(0, debt.amount - (debt.paidAmount ?? 0))),
  );
  const supplierBills = sumMoney(
    openDebts
      .filter((debt) => debt.type === "business_owes_supplier")
      .map((debt) => Math.max(0, debt.amount - (debt.paidAmount ?? 0))),
  );
  const stockCostValue = sumMoney(inventoryItems.map((item) => item.quantityOnHand * item.costPrice));
  const potentialRevenue = sumMoney(inventoryItems.map((item) => item.quantityOnHand * item.sellingPrice));
  const productTotals = summarizeProducts(sales);
  const soldItemIds = new Set(productTotals.map((item) => item.itemId));
  const slowProducts = inventoryItems
    .filter((item) => item.quantityOnHand > 0 && !soldItemIds.has(item.id))
    .map((item) => ({
      itemId: item.id,
      name: item.name,
      quantityOnHand: item.quantityOnHand,
      stockCostValue: roundMoney(item.quantityOnHand * item.costPrice),
    }))
    .sort((a, b) => b.stockCostValue - a.stockCostValue)
    .slice(0, 5);
  const locationComparison = locations.map((location) => {
    const locationTransactions = periodTransactions.filter((transaction) => transaction.locationId === location.id);
    const locationSales = locationTransactions.filter((transaction) => transaction.type === "sale");
    const locationExpenses = locationTransactions.filter((transaction) => transaction.type === "expense");
    const locationRevenue = sumMoney(locationSales.map((transaction) => transaction.amount));
    const locationExpenseTotal = sumMoney(locationExpenses.map((transaction) => transaction.amount));

    return {
      locationId: location.id,
      name: location.name,
      revenue: locationRevenue,
      expenses: locationExpenseTotal,
      profit: roundMoney(
        sumMoney(locationSales.map((transaction) => transaction.profit ?? transaction.amount - (transaction.costOfGoods ?? 0))) -
          locationExpenseTotal,
      ),
    };
  });
  const latestTransaction = [...periodTransactions].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  )[0];

  return {
    formulaVersion: executiveDashboardFormulaVersion,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    generatedAt: generatedAt.toISOString(),
    summary: {
      revenue,
      expenses: expenseTotal,
      profit: roundMoney(profit),
      cashAvailable,
      outstandingCustomerDebt,
      supplierBills,
      stockCostValue,
      potentialRevenue,
      grossMarginPercent: revenue > 0 ? roundMoney((grossProfit / revenue) * 100) : null,
      bestProducts: productTotals.slice(0, 5),
      slowProducts,
      locationComparison,
    },
    recommendedActions: buildRecommendedActions({
      profit,
      revenue,
      cashAvailable,
      supplierBills,
      outstandingCustomerDebt,
      slowProductsCount: slowProducts.length,
    }),
    sourceMetrics: {
      transactionCount: periodTransactions.length,
      saleCount: sales.length,
      expenseCount: expenses.length,
      debtCount: debts.length,
      inventoryItemCount: inventoryItems.length,
    },
    freshness: {
      latestTransactionAt: latestTransaction ? new Date(latestTransaction.occurredAt).toISOString() : null,
      generatedAt: generatedAt.toISOString(),
    },
  };
}

function summarizeProducts(transactions: ExecutiveDashboardTransaction[]) {
  const totals = new Map<string, { itemId: string; name: string; quantitySold: number; revenue: number }>();

  for (const transaction of transactions) {
    if (!transaction.inventoryItemId) {
      continue;
    }

    const current = totals.get(transaction.inventoryItemId) ?? {
      itemId: transaction.inventoryItemId,
      name: transaction.productName ?? "Product",
      quantitySold: 0,
      revenue: 0,
    };
    totals.set(transaction.inventoryItemId, {
      ...current,
      quantitySold: current.quantitySold + 1,
      revenue: roundMoney(current.revenue + transaction.amount),
    });
  }

  return Array.from(totals.values()).sort((a, b) => b.revenue - a.revenue);
}

function buildRecommendedActions({
  profit,
  revenue,
  cashAvailable,
  supplierBills,
  outstandingCustomerDebt,
  slowProductsCount,
}: {
  profit: number;
  revenue: number;
  cashAvailable: number;
  supplierBills: number;
  outstandingCustomerDebt: number;
  slowProductsCount: number;
}) {
  const actions: string[] = [];

  if (revenue === 0) {
    actions.push("Record sales for this period before making revenue decisions.");
  }

  if (profit < 0) {
    actions.push("Review expenses because this period is currently loss-making.");
  }

  if (supplierBills > cashAvailable) {
    actions.push("Review supplier bills before committing more cash.");
  }

  if (outstandingCustomerDebt > 0) {
    actions.push("Follow up on outstanding customer debt.");
  }

  if (slowProductsCount > 0) {
    actions.push("Review slow-moving stock before buying more inventory.");
  }

  return actions.slice(0, 5);
}

function sumMoney(values: number[]) {
  return roundMoney(values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0));
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
