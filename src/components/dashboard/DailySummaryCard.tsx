import { CalendarDays } from "lucide-react";
import type { MoneybookState } from "@/lib/bookkeeping/transaction-engine";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";
import {
  getActiveTransactions,
  getLowStockItems,
  getMoneyTotals,
  getOpenCustomerDebts,
  getTransactionsForDay,
} from "@/lib/dashboard/simple-insights";

export function DailySummaryCard({ state }: { state: MoneybookState }) {
  const todayTotals = getMoneyTotals(getTransactionsForDay(getActiveTransactions(state)));
  const customersOwing = getOpenCustomerDebts(state.debts).length;
  const lowStockCount = getLowStockItems(state.items).length;

  return (
    <section className="rounded-2xl border border-gray-100 bg-primary p-5 text-white shadow-lg md:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
          <CalendarDays size={20} aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm text-white/70">Today</p>
          <h2 className="text-xl font-semibold tracking-tight">Daily summary</h2>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        <MoneyLine label="Money In" value={todayTotals.moneyIn} />
        <MoneyLine label="Money Out" value={todayTotals.moneyOut} />
        <MoneyLine label="Profit" value={todayTotals.profit} strong />
      </div>

      <div className="mt-5 grid gap-2 rounded-2xl bg-white/10 p-4 text-sm font-medium text-white/90">
        <p>
          {customersOwing} customer{customersOwing === 1 ? "" : "s"} owe you.
        </p>
        <p>
          {lowStockCount} item{lowStockCount === 1 ? "" : "s"} low in stock.
        </p>
      </div>
    </section>
  );
}

function MoneyLine({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white/10 px-4 py-3">
      <span className="text-sm text-white/75">{label}</span>
      <strong className={strong ? "text-2xl" : "text-lg"}>{formatNaira(value)}</strong>
    </div>
  );
}
