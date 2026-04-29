import type { DashboardSummary } from "@/components/dashboard/types";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

export function InsightStrip({
  summary,
  transactionCount,
}: {
  summary: DashboardSummary;
  transactionCount: number;
}) {
  const insights = [
    `Profit today: ${formatNaira(summary.profit)}.`,
    `Customers owing: ${formatNaira(summary.customerDebt)}.`,
    summary.customerDebt > 0
      ? "Action: follow up the people who will pay later."
      : "Action: keep recording as money moves.",
    `Recorded today: ${transactionCount} item${transactionCount === 1 ? "" : "s"}.`,
  ];

  return (
    <section className="rounded-xl bg-white p-4 shadow-soft sm:p-6">
      <h2 className="text-lg font-semibold">Today&apos;s clarity</h2>
      <ul className="mt-3 grid gap-2 text-sm text-black/70 sm:grid-cols-2">
        {insights.map((insight) => (
          <li key={insight} className="rounded-xl bg-[#F5F3EF] p-3">
            {insight}
          </li>
        ))}
      </ul>
    </section>
  );
}
