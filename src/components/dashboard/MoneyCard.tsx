import type { DashboardSummary } from "@/components/dashboard/types";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

export function MoneyCard({ summary }: { summary: DashboardSummary }) {
  return (
    <section className="rounded-xl bg-ink p-5 text-white shadow-soft sm:p-6">
      <p className="text-sm text-white/65">You have</p>
      <strong className="mt-2 block break-words text-4xl font-bold leading-tight sm:text-5xl">
        {formatNaira(summary.balance)}
      </strong>

      <div className="mt-5 rounded-xl bg-white/8 p-4">
        <p className="text-sm font-medium text-white/75">Today:</p>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-base font-semibold">
          <span className="text-emerald-200">+ {formatNaira(summary.income)} in</span>
          <span className="text-red-200">- {formatNaira(summary.expenses)} out</span>
        </div>
      </div>

      <p className="mt-4 text-sm text-white/55">Across cash, bank and POS</p>
    </section>
  );
}
