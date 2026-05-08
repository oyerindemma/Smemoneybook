import type { DashboardSummary } from "@/components/dashboard/types";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

export function SummaryCard({
  summary,
  onViewDetails,
}: {
  summary: DashboardSummary;
  onViewDetails: () => void;
}) {
  return (
    <section className="rounded-2xl bg-card p-6 shadow-sm border border-gray-100 transition-shadow duration-200 md:hover:shadow-md md:p-7">
      <p className="text-xs text-textSecondary md:text-sm">This month</p>
      <div className="mt-6 grid gap-4">
        <SummaryLine label="You made" value={formatNaira(summary.income)} tone="good" />
        <SummaryLine label="You spent" value={formatNaira(summary.expenses)} tone="bad" />
        <SummaryLine label="Profit" value={formatNaira(summary.profit)} tone="plain" />
      </div>
      <button
        className="mt-6 min-h-11 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-primaryHover hover:shadow-md active:scale-[0.98]"
        type="button"
        onClick={onViewDetails}
      >
        View details
      </button>
    </section>
  );
}

function SummaryLine({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad" | "plain";
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-background p-5">
      <span className="text-sm text-textSecondary md:text-base">{label}</span>
      <strong
        className={`font-bold tabular-nums ${
          tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : "text-textPrimary"
        }`}
      >
        {value}
      </strong>
    </div>
  );
}
