import { AlertTriangle } from "lucide-react";
import type { MoneybookState } from "@/lib/bookkeeping/transaction-engine";
import {
  getActiveTransactions,
  getLowStockItems,
  getMoneyTotals,
  getOpenCustomerDebts,
  getPeriodStart,
  getTransactionsForDay,
  getTransactionsSince,
} from "@/lib/dashboard/simple-insights";

export function SmartAlerts({ state }: { state: MoneybookState }) {
  const alerts = buildAlerts(state);

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm md:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-textPrimary">
          <AlertTriangle size={20} aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-medium text-textSecondary">Smart alerts</p>
          <h2 className="text-lg font-semibold tracking-tight text-textPrimary">Needs attention</h2>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {alerts.length === 0 ? (
          <div className="rounded-2xl bg-success/10 p-4 text-sm font-semibold text-success">
            Nothing urgent right now.
          </div>
        ) : (
          alerts.slice(0, 4).map((alert) => (
            <div
              key={alert}
              className="rounded-2xl border border-accent/20 bg-background p-4 text-sm font-medium leading-5 text-textPrimary"
            >
              {alert}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function buildAlerts(state: MoneybookState) {
  const alerts: string[] = [];
  const activeTransactions = getActiveTransactions(state);
  const lowStockItems = getLowStockItems(state.items);
  const overdueDebts = getOpenCustomerDebts(state.debts).filter((debt) => debt.isOverdue);
  const todayTransactions = getTransactionsForDay(activeTransactions);
  const weekTotals = getMoneyTotals(getTransactionsSince(activeTransactions, getPeriodStart("week")));
  const monthTotals = getMoneyTotals(getTransactionsSince(activeTransactions, getPeriodStart("month")));

  if (lowStockItems.length > 0) {
    alerts.push(`${lowStockItems.length} stock item${lowStockItems.length === 1 ? "" : "s"} need restock.`);
  }

  if (overdueDebts.length > 0) {
    alerts.push(`${overdueDebts.length} overdue customer debt${overdueDebts.length === 1 ? "" : "s"} need follow up.`);
  }

  if (todayTransactions.length === 0) {
    alerts.push("No activity recorded today.");
  }

  if (weekTotals.moneyIn > 0 && monthTotals.moneyIn > weekTotals.moneyIn * 3) {
    alerts.push("Sales are slower this week.");
  }

  if (getOpenCustomerDebts(state.debts).length > 0) {
    alerts.push("Send a WhatsApp reminder for unpaid invoices.");
  }

  return alerts;
}
