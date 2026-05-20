import { Sparkles } from "lucide-react";
import type { MoneybookState } from "@/lib/bookkeeping/transaction-engine";
import { buildSimpleAiInsights } from "@/lib/dashboard/simple-insights";

export function LightweightAiInsights({ state }: { state: MoneybookState }) {
  const insights = buildSimpleAiInsights(state);

  if (insights.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm md:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Sparkles size={20} aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-medium text-textSecondary">MoneyBook tips</p>
          <h2 className="text-lg font-semibold tracking-tight text-textPrimary">Simple insights</h2>
        </div>
      </div>
      <div className="mt-5 grid gap-3">
        {insights.map((insight) => (
          <p key={insight} className="rounded-2xl bg-background p-4 text-sm font-medium leading-5 text-textPrimary">
            {insight}
          </p>
        ))}
      </div>
    </section>
  );
}
