import { HandCoins } from "lucide-react";
import type { Debt } from "@/components/dashboard/types";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";
import { getOpenCustomerDebts } from "@/lib/dashboard/simple-insights";

export function ReceivablesSummary({ debts }: { debts: Debt[] }) {
  const customerDebts = getOpenCustomerDebts(debts);
  const totalOwed = customerDebts.reduce((sum, debt) => sum + debt.remainingAmount, 0);
  const oldestDebt = customerDebts
    .filter((debt) => debt.dueAt)
    .sort((first, second) => Date.parse(first.dueAt ?? "") - Date.parse(second.dueAt ?? ""))[0];
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - 7);
  const collectedThisWeek = debts.reduce(
    (sum, debt) =>
      sum +
      debt.events
        .filter(
          (event) =>
            event.type === "customer_collection" &&
            new Date(event.createdAt) >= weekStart,
        )
        .reduce((eventSum, event) => eventSum + (event.amount ?? 0), 0),
    0,
  );

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm md:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <HandCoins size={20} aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-medium text-textSecondary">Receivables</p>
          <h2 className="text-lg font-semibold tracking-tight text-textPrimary">Money to collect</h2>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <Metric label="Total Owed" value={formatNaira(totalOwed)} />
        <Metric label="Customers Owing" value={String(customerDebts.length)} />
        <Metric
          label="Oldest Debt"
          value={oldestDebt?.dueAt ? formatDate(oldestDebt.dueAt) : "None"}
        />
        <Metric label="Collected This Week" value={formatNaira(collectedThisWeek)} />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-background p-4">
      <p className="text-xs font-medium text-textSecondary">{label}</p>
      <strong className="mt-2 block text-base text-textPrimary">{value}</strong>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
