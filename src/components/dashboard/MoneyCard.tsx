import type { DashboardSummary } from "@/components/dashboard/types";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

export function MoneyCard({ summary }: { summary: DashboardSummary }) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-primary p-6 text-white shadow-xl transition-shadow duration-200 md:p-8 md:hover:shadow-2xl">
      <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-white/15 blur-3xl" />
      <div className="absolute -bottom-24 left-8 h-56 w-56 rounded-full bg-accent/20 blur-3xl" />
      <div className="relative">
        <p className="text-xs font-medium text-card/70 md:text-sm">Available balance</p>
        <strong className="mt-3 block break-words text-5xl font-bold leading-none tracking-tight tabular-nums md:text-6xl">
          {formatNaira(summary.balance)}
        </strong>

      <div className="mt-8 rounded-2xl bg-white/10 p-4 backdrop-blur">
        <p className="text-xs font-medium text-card/80 md:text-sm">Today</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-white/60 md:text-sm">Money in</p>
            <strong className="mt-1 block text-xl font-bold tabular-nums text-success md:text-2xl">
              + {formatNaira(summary.income)}
            </strong>
          </div>
          <div>
            <p className="text-xs text-white/60 md:text-sm">Money out</p>
            <strong className="mt-1 block text-xl font-bold tabular-nums text-danger md:text-2xl">
              - {formatNaira(summary.expenses)}
            </strong>
          </div>
        </div>
      </div>

        <p className="mt-5 text-xs text-card/60 md:text-sm">Across cash, bank and POS</p>
      </div>
    </section>
  );
}
