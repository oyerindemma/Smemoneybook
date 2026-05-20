import type {
  Debt,
  InventoryItem,
  MoneybookState,
  Transaction,
} from "@/lib/bookkeeping/transaction-engine";

export type SimpleStatus = "Healthy" | "Warning" | "Needs Attention";

export function getActiveTransactions(state: MoneybookState) {
  return state.transactions.filter((transaction) => !transaction.reversedByTransactionId);
}

export function getTodayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function getTransactionsForDay(transactions: Transaction[], dayKey = getTodayKey()) {
  return transactions.filter((transaction) => transaction.occurredAt.slice(0, 10) === dayKey);
}

export function getPeriodStart(period: "week" | "month", now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (period === "week") {
    const day = start.getDay();
    const daysFromMonday = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - daysFromMonday);
    return start;
  }

  start.setDate(1);
  return start;
}

export function getTransactionsSince(transactions: Transaction[], start: Date) {
  return transactions.filter((transaction) => new Date(transaction.occurredAt) >= start);
}

export function getMoneyTotals(transactions: Transaction[]) {
  const moneyIn = transactions.reduce((sum, transaction) => {
    if (transaction.type === "sale" && transaction.paymentStatus === "paid") {
      return sum + transaction.amount;
    }

    if (transaction.type === "adjustment" && transaction.reversesTransactionType === "sale") {
      return sum - transaction.amount;
    }

    return sum;
  }, 0);
  const moneyOut = transactions.reduce((sum, transaction) => {
    if (transaction.type === "expense" && transaction.paymentStatus === "paid") {
      return sum + transaction.amount;
    }

    if (transaction.type === "adjustment" && transaction.reversesTransactionType === "expense") {
      return sum - transaction.amount;
    }

    return sum;
  }, 0);
  const profit = transactions.reduce((sum, transaction) => sum + transaction.profit, 0) - moneyOut;

  return {
    moneyIn,
    moneyOut,
    profit,
    remaining: moneyIn - moneyOut,
  };
}

export function getOpenCustomerDebts(debts: Debt[]) {
  return debts.filter(
    (debt) => debt.type === "customer_owes_business" && debt.status === "open" && debt.remainingAmount > 0,
  );
}

export function getLowStockItems(items: InventoryItem[]) {
  return items.filter((item) => item.quantityOnHand <= item.lowStockLevel);
}

export function getBusinessHealth(state: MoneybookState) {
  const transactions = getActiveTransactions(state);
  const todayTotals = getMoneyTotals(getTransactionsForDay(transactions));
  const customerDebts = getOpenCustomerDebts(state.debts);
  const lowStockItems = getLowStockItems(state.items);
  const recentSales = transactions
    .filter((transaction) => transaction.type === "sale")
    .slice(0, 10);
  const olderSales = recentSales.slice(5);
  const latestSales = recentSales.slice(0, 5);
  const olderSalesTotal = olderSales.reduce((sum, transaction) => sum + transaction.amount, 0);
  const latestSalesTotal = latestSales.reduce((sum, transaction) => sum + transaction.amount, 0);

  return [
    {
      label: "Cash Flow",
      status: statusFromNumbers(todayTotals.remaining, todayTotals.moneyIn > 0 ? 0 : -1),
      helper:
        todayTotals.remaining >= 0
          ? "Money in covers money out."
          : "Money out is higher today.",
    },
    {
      label: "Debt Level",
      status: customerDebts.some((debt) => debt.isOverdue)
        ? "Needs Attention"
        : customerDebts.length > 0
          ? "Warning"
          : "Healthy",
      helper:
        customerDebts.length === 0
          ? "No customer debt waiting."
          : `${customerDebts.length} customer${customerDebts.length === 1 ? "" : "s"} owe you.`,
    },
    {
      label: "Stock Health",
      status:
        lowStockItems.length === 0
          ? "Healthy"
          : lowStockItems.some((item) => item.quantityOnHand === 0)
            ? "Needs Attention"
            : "Warning",
      helper:
        lowStockItems.length === 0
          ? "Stock levels look okay."
          : `${lowStockItems.length} item${lowStockItems.length === 1 ? "" : "s"} need restock.`,
    },
    {
      label: "Sales Trend",
      status:
        recentSales.length === 0
          ? "Warning"
          : olderSalesTotal > 0 && latestSalesTotal < olderSalesTotal * 0.6
            ? "Needs Attention"
            : "Healthy",
      helper:
        recentSales.length === 0
          ? "No sales recorded yet."
          : olderSalesTotal > 0 && latestSalesTotal < olderSalesTotal * 0.6
            ? "Sales are lower than before."
            : "Sales look steady.",
    },
  ] satisfies Array<{ label: string; status: SimpleStatus; helper: string }>;
}

export function buildSimpleAiInsights(state: MoneybookState) {
  const transactions = getActiveTransactions(state);
  const customerDebts = getOpenCustomerDebts(state.debts);
  const lowStockItems = getLowStockItems(state.items);
  const insights: string[] = [];

  const productSales = new Map<string, { quantity: number; amount: number }>();
  for (const transaction of transactions) {
    if (transaction.type !== "sale" || !transaction.inventoryItemId) {
      continue;
    }

    const item = state.items.find((stockItem) => stockItem.id === transaction.inventoryItemId);
    const name = item?.name ?? transaction.description;
    const current = productSales.get(name) ?? { quantity: 0, amount: 0 };
    productSales.set(name, {
      quantity: current.quantity + (transaction.inventoryQuantity ?? 1),
      amount: current.amount + transaction.amount,
    });
  }

  const topProduct = Array.from(productSales.entries()).sort(
    (first, second) => second[1].quantity - first[1].quantity,
  )[0];

  if (customerDebts.length > 0) {
    insights.push(
      `${customerDebts.length} customer${customerDebts.length === 1 ? "" : "s"} still need follow up.`,
    );
  }

  if (topProduct) {
    insights.push(`${topProduct[0]} is your best-selling product so far.`);
  }

  if (lowStockItems.length > 0) {
    insights.push(`${lowStockItems[0].name} is low in stock. Restock soon.`);
  }

  const monthTotals = getMoneyTotals(
    getTransactionsSince(transactions, getPeriodStart("month")),
  );
  if (monthTotals.moneyOut > monthTotals.moneyIn && monthTotals.moneyIn > 0) {
    insights.push("Expenses are higher than sales this month.");
  }

  return insights.slice(0, 3);
}

function statusFromNumbers(current: number, warningFloor: number): SimpleStatus {
  if (current < warningFloor) {
    return "Needs Attention";
  }

  if (current === warningFloor) {
    return "Warning";
  }

  return "Healthy";
}
