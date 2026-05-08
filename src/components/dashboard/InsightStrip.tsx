import type { DashboardSummary } from "@/components/dashboard/types";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

export function InsightStrip({
  summary,
  activityCount,
}: {
  summary: DashboardSummary;
  activityCount: number;
}) {
  const insights =
    activityCount === 0
      ? ["No activity yet. Record your first sale to see today’s clarity."]
      : [
          summary.profit > 0
            ? `You made ${formatNaira(summary.profit)} today.`
            : "You recorded money today.",
          summary.customerDebt > 0 ? `Customers still owe ${formatNaira(summary.customerDebt)}.` : null,
          `Money in: ${formatNaira(summary.income)}.`,
          `Money out: ${formatNaira(summary.expenses)}.`,
          `You recorded ${activityCount} money activit${activityCount === 1 ? "y" : "ies"} today.`,
          "Great job — your money is up to date.",
        ].filter((insight): insight is string => Boolean(insight));

  return (
    <section className="rounded-2xl bg-card p-6 shadow-sm border border-gray-100 transition-shadow duration-200 md:hover:shadow-md md:p-7">
      <h2 className="text-xl font-semibold tracking-tight md:text-2xl">Today&apos;s clarity</h2>
      <ul className="mt-5 grid gap-3 text-sm leading-6 text-textSecondary md:text-base lg:grid-cols-1">
        {insights.map((insight) => (
          <li key={insight} className="rounded-2xl bg-background p-5 leading-6">
            {insight}
          </li>
        ))}
      </ul>
    </section>
  );
}
