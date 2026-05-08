import {
  getDashboardSummary,
  type MoneybookState,
} from "@/lib/bookkeeping/transaction-engine";

export function getDailyDashboardSummary(state: MoneybookState) {
  return getDashboardSummary(state);
}

export function getTodayActivities(state: MoneybookState, now = new Date()) {
  const dayKey = now.toISOString().slice(0, 10);

  return state.transactions.filter(
    (transaction) =>
      !transaction.reversedByTransactionId &&
      transaction.occurredAt.slice(0, 10) === dayKey,
  );
}
