import {
  formatNaira,
  type Debt,
  type MoneybookState,
  type Transaction,
} from "@/lib/bookkeeping/transaction-engine";
import {
  getActiveTransactions,
  getMoneyTotals,
  getPeriodStart,
  getTransactionsForDay,
  getTransactionsSince,
} from "@/lib/dashboard/simple-insights";

export type BusinessHealthRating = "Excellent" | "Good" | "Needs attention";
export type RetentionSegment = "New" | "Active" | "Inactive";

export type RetentionEngineResult = {
  dailyOpenLoop: string[];
  smartInsights: string[];
  weeklyReport: {
    totalSales: number;
    totalExpenses: number;
    totalProfit: number;
    bestDay?: string;
    biggestExpense?: string;
    topCustomer?: string;
    growthTrend: string;
    recommendation: string;
  };
  streak: {
    days: number;
    message: string;
  };
  businessHealth: {
    score: number;
    rating: BusinessHealthRating;
    components: {
      consistency: number;
      profitTrend: number;
      expenseControl: number;
      invoiceRecovery: number;
      cashflowStability: number;
    };
  };
  businessMoments: string[];
  invoiceReminders: string[];
  recoveryMessage?: string;
  advisor: string[];
  segment: RetentionSegment;
  notificationIdeas: string[];
};

export function buildRetentionEngine(state: MoneybookState, now = new Date()): RetentionEngineResult {
  const transactions = getActiveTransactions(state);
  const today = getTransactionsForDay(transactions, dayKey(now));
  const yesterday = getTransactionsForDay(transactions, dayKey(addDays(now, -1)));
  const week = getTransactionsSince(transactions, getPeriodStart("week", now));
  const previousWeek = transactions.filter((transaction) => {
    const date = new Date(transaction.occurredAt);
    const weekStart = getPeriodStart("week", now);
    const previousWeekStart = addDays(weekStart, -7);
    return date >= previousWeekStart && date < weekStart;
  });
  const todayTotals = getMoneyTotals(today);
  const yesterdayTotals = getMoneyTotals(yesterday);
  const weekTotals = getMoneyTotals(week);
  const previousWeekTotals = getMoneyTotals(previousWeek);
  const customerDebts = getOpenCustomerDebts(state.debts);
  const customerDebtTotal = customerDebts.reduce((sum, debt) => sum + debt.remainingAmount, 0);
  const streakDays = getTrackingStreak(transactions, now);
  const health = getBusinessHealthScore({
    streakDays,
    weekProfit: weekTotals.profit,
    previousWeekProfit: previousWeekTotals.profit,
    weekExpenses: weekTotals.moneyOut,
    weekSales: weekTotals.moneyIn,
    customerDebtTotal,
    cashBalance: state.accounts.reduce((sum, account) => sum + account.balance, 0),
  });
  const weeklyReport = buildWeeklyReport(week, previousWeekTotals.moneyIn);
  const inactiveDays = getInactiveDays(transactions, now);
  const segment = getRetentionSegment(transactions.length, inactiveDays);

  return {
    dailyOpenLoop: [
      `Today’s profit: ${formatNaira(todayTotals.profit)}.`,
      weekTotals.moneyIn > 0
        ? `This week’s sales: ${formatNaira(weekTotals.moneyIn)}.`
        : "Record today’s sale to start your weekly trend.",
      customerDebtTotal > 0
        ? `Customers owe you ${formatNaira(customerDebtTotal)}.`
        : "No customer payment waiting right now.",
      health.score >= 70
        ? "Your business health looks good today."
        : "Your business needs a little attention today.",
    ],
    smartInsights: buildSmartInsights({
      todayProfit: todayTotals.profit,
      yesterdayProfit: yesterdayTotals.profit,
      weekExpenses: weekTotals.moneyOut,
      previousWeekExpenses: previousWeekTotals.moneyOut,
      customerDebtTotal,
      bestDay: weeklyReport.bestDay,
      streakDays,
    }),
    weeklyReport,
    streak: {
      days: streakDays,
      message:
        streakDays > 1
          ? `You tracked your business ${streakDays} days in a row.`
          : "Track again tomorrow to start a streak.",
    },
    businessHealth: health,
    businessMoments: buildBusinessMoments(transactions, streakDays),
    invoiceReminders: buildInvoiceReminders(customerDebts, now),
    recoveryMessage:
      inactiveDays >= 3
        ? `You haven’t tracked sales in ${inactiveDays} days. Let’s update your business today.`
        : undefined,
    advisor: buildAdvisor({
      weekSales: weekTotals.moneyIn,
      previousWeekSales: previousWeekTotals.moneyIn,
      weekExpenses: weekTotals.moneyOut,
      previousWeekExpenses: previousWeekTotals.moneyOut,
      customerDebtTotal,
      cashBalance: state.accounts.reduce((sum, account) => sum + account.balance, 0),
    }),
    segment,
    notificationIdeas: buildNotificationIdeas({
      todayCount: today.length,
      customerDebtTotal,
      inactiveDays,
      weekProfit: weekTotals.profit,
      bestDay: weeklyReport.bestDay,
    }),
  };
}

function buildSmartInsights(input: {
  todayProfit: number;
  yesterdayProfit: number;
  weekExpenses: number;
  previousWeekExpenses: number;
  customerDebtTotal: number;
  bestDay?: string;
  streakDays: number;
}) {
  const insights: string[] = [];

  if (input.todayProfit > input.yesterdayProfit && input.yesterdayProfit > 0) {
    insights.push("You made more profit today than yesterday.");
  }

  if (input.weekExpenses > input.previousWeekExpenses && input.previousWeekExpenses > 0) {
    const increase = Math.round(((input.weekExpenses - input.previousWeekExpenses) / input.previousWeekExpenses) * 100);
    insights.push(`Expenses increased by ${increase}% this week.`);
  }

  if (input.bestDay) {
    insights.push(`${input.bestDay} is usually your strongest sales day.`);
  }

  if (input.customerDebtTotal > 0) {
    insights.push(`You have ${formatNaira(input.customerDebtTotal)} unpaid.`);
  }

  if (input.streakDays >= 3) {
    insights.push("Your consistency is paying off.");
  }

  return insights.length > 0 ? insights.slice(0, 4) : ["Open MoneyBook daily to see what changed in your business."];
}

function buildWeeklyReport(transactions: Transaction[], previousWeekSales: number) {
  const totals = getMoneyTotals(transactions);
  const expense = transactions
    .filter((transaction) => transaction.type === "expense")
    .sort((first, second) => second.amount - first.amount)[0];
  const topCustomer = transactions
    .filter((transaction) => transaction.type === "sale" && transaction.partyName)
    .reduce((map, transaction) => {
      const name = transaction.partyName as string;
      map.set(name, (map.get(name) ?? 0) + transaction.amount);
      return map;
    }, new Map<string, number>());
  const topCustomerName = Array.from(topCustomer.entries()).sort((first, second) => second[1] - first[1])[0]?.[0];
  const bestDay = getBestSalesDay(transactions);
  const growth =
    previousWeekSales > 0
      ? Math.round(((totals.moneyIn - previousWeekSales) / previousWeekSales) * 100)
      : totals.moneyIn > 0
        ? 100
        : 0;

  return {
    totalSales: totals.moneyIn,
    totalExpenses: totals.moneyOut,
    totalProfit: totals.profit,
    bestDay,
    biggestExpense: expense?.category ?? expense?.description,
    topCustomer: topCustomerName,
    growthTrend: growth >= 0 ? `Sales are up ${growth}% this week.` : `Sales are down ${Math.abs(growth)}% this week.`,
    recommendation:
      totals.moneyOut < totals.moneyIn
        ? "You spent less than you made. Great improvement."
        : "Review expenses so more sales becomes real profit.",
  };
}

function getBusinessHealthScore(input: {
  streakDays: number;
  weekProfit: number;
  previousWeekProfit: number;
  weekExpenses: number;
  weekSales: number;
  customerDebtTotal: number;
  cashBalance: number;
}) {
  const components = {
    consistency: Math.min(100, input.streakDays * 20),
    profitTrend: input.weekProfit >= input.previousWeekProfit ? 100 : 45,
    expenseControl: input.weekSales === 0 ? 40 : Math.max(20, Math.min(100, 100 - (input.weekExpenses / input.weekSales) * 60)),
    invoiceRecovery: input.customerDebtTotal === 0 ? 100 : 55,
    cashflowStability: input.cashBalance > 0 ? 100 : 35,
  };
  const score = Math.round(
    (components.consistency + components.profitTrend + components.expenseControl + components.invoiceRecovery + components.cashflowStability) / 5,
  );
  const rating: BusinessHealthRating = score >= 80 ? "Excellent" : score >= 60 ? "Good" : "Needs attention";

  return { score, rating, components };
}

function buildBusinessMoments(transactions: Transaction[], streakDays: number) {
  const totalTracked = transactions.reduce((sum, transaction) => {
    if (transaction.type === "sale" || transaction.type === "expense") {
      return sum + transaction.amount;
    }
    return sum;
  }, 0);
  const moments: string[] = [];

  if (totalTracked >= 1_000_000) {
    moments.push("Big moment: you’ve tracked your first ₦1M.");
  }

  if (streakDays >= 7) {
    moments.push("7-day business tracking streak.");
  }

  const highestProfitDay = getHighestProfitDay(transactions);
  if (highestProfitDay) {
    moments.push(`${highestProfitDay.day} is your highest profit day so far.`);
  }

  return moments;
}

function buildInvoiceReminders(debts: Debt[], now: Date) {
  return debts
    .map((debt) => {
      if (!debt.dueAt) {
        return `${debt.partyName} still owes ${formatNaira(debt.remainingAmount)}.`;
      }

      const days = Math.ceil((new Date(debt.dueAt).getTime() - now.getTime()) / 86_400_000);
      if (days === 1) {
        return `${debt.partyName} payment is due tomorrow.`;
      }

      if (days < 0) {
        return `${debt.partyName} invoice is unpaid for ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}.`;
      }

      return null;
    })
    .filter((item): item is string => Boolean(item))
    .slice(0, 3);
}

function buildAdvisor(input: {
  weekSales: number;
  previousWeekSales: number;
  weekExpenses: number;
  previousWeekExpenses: number;
  customerDebtTotal: number;
  cashBalance: number;
}) {
  const advice: string[] = [];

  if (input.previousWeekSales > 0 && input.weekSales < input.previousWeekSales * 0.8) {
    advice.push("Sales drop detected this week.");
  }

  if (input.previousWeekExpenses > 0 && input.weekExpenses > input.previousWeekExpenses * 1.25) {
    advice.push("Expenses are unusually high this week.");
  }

  if (input.customerDebtTotal > 0) {
    advice.push("Send payment reminders to recover cash faster.");
  }

  if (input.cashBalance <= 0) {
    advice.push("Low cash balance. Record payments and expenses today.");
  }

  return advice.length > 0 ? advice : ["Your business is improving when you track it daily."];
}

function buildNotificationIdeas(input: {
  todayCount: number;
  customerDebtTotal: number;
  inactiveDays: number;
  weekProfit: number;
  bestDay?: string;
}) {
  return [
    input.todayCount === 0 ? "Daily sales reminder" : `Daily profit summary: ${formatNaira(input.weekProfit)} this week.`,
    input.customerDebtTotal > 0 ? `Unpaid invoice alert: ${formatNaira(input.customerDebtTotal)} waiting.` : null,
    input.bestDay ? `Weekly report: ${input.bestDay} is your strongest sales day.` : "Weekly business report",
    input.inactiveDays >= 3 ? "Inactive tracking recovery reminder" : null,
  ].filter((item): item is string => Boolean(item));
}

function getRetentionSegment(transactionCount: number, inactiveDays: number): RetentionSegment {
  if (inactiveDays >= 3) {
    return "Inactive";
  }
  return transactionCount >= 7 ? "Active" : "New";
}

function getTrackingStreak(transactions: Transaction[], now: Date) {
  const days = new Set(transactions.map((transaction) => transaction.occurredAt.slice(0, 10)));
  let streak = 0;

  for (let index = 0; index < 365; index += 1) {
    if (!days.has(dayKey(addDays(now, -index)))) {
      break;
    }
    streak += 1;
  }

  return streak;
}

function getInactiveDays(transactions: Transaction[], now: Date) {
  const latest = transactions
    .map((transaction) => new Date(transaction.occurredAt).getTime())
    .sort((first, second) => second - first)[0];
  if (!latest) {
    return 999;
  }
  return Math.floor((now.getTime() - latest) / 86_400_000);
}

function getOpenCustomerDebts(debts: Debt[]) {
  return debts.filter(
    (debt) => debt.type === "customer_owes_business" && debt.status === "open" && debt.remainingAmount > 0,
  );
}

function getBestSalesDay(transactions: Transaction[]) {
  const totals = new Map<string, number>();
  const formatter = new Intl.DateTimeFormat("en-NG", { weekday: "long" });
  for (const transaction of transactions) {
    if (transaction.type !== "sale") {
      continue;
    }
    const day = formatter.format(new Date(transaction.occurredAt));
    totals.set(day, (totals.get(day) ?? 0) + transaction.amount);
  }
  return Array.from(totals.entries()).sort((first, second) => second[1] - first[1])[0]?.[0];
}

function getHighestProfitDay(transactions: Transaction[]) {
  const totals = new Map<string, number>();
  const formatter = new Intl.DateTimeFormat("en-NG", { weekday: "long" });
  for (const transaction of transactions) {
    const key = transaction.occurredAt.slice(0, 10);
    const value = transaction.type === "expense" ? -transaction.amount : transaction.profit;
    totals.set(key, (totals.get(key) ?? 0) + value);
  }
  const result = Array.from(totals.entries()).sort((first, second) => second[1] - first[1])[0];
  return result ? { day: formatter.format(new Date(result[0])), profit: result[1] } : null;
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
