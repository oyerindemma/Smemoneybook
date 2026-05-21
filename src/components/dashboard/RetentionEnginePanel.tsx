import type { MoneybookState } from "@/lib/bookkeeping/transaction-engine";
import { buildRetentionEngine } from "@/lib/retention/retention-engine";

export function RetentionEnginePanel({ state }: { state: MoneybookState }) {
  const retention = buildRetentionEngine(state);
  const heroInsight = retention.smartInsights[0] ?? retention.dailyOpenLoop[0];

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-4 shadow-sm md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-textSecondary">Today’s business check</p>
          <h2 className="mt-1 text-lg font-semibold leading-6 text-textPrimary">{heroInsight}</h2>
        </div>
        <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
          {retention.businessHealth.score}/100
        </span>
      </div>

      <div className="mt-4 grid gap-2">
        <PulseLine label="Streak" value={retention.streak.message} />
        <PulseLine label="Health" value={`${retention.businessHealth.rating}. ${retention.advisor[0]}`} />
        {retention.invoiceReminders[0] ? (
          <PulseLine label="Customer alert" value={retention.invoiceReminders[0]} />
        ) : (
          <PulseLine label="Customer alert" value="No urgent customer payment reminder right now." />
        )}
        {retention.businessMoments[0] ? (
          <PulseLine label="Business moment" value={retention.businessMoments[0]} />
        ) : null}
      </div>
    </section>
  );
}

function PulseLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background px-3.5 py-3">
      <p className="text-xs font-semibold uppercase text-textMuted">{label}</p>
      <p className="mt-1 text-sm font-medium leading-5 text-textPrimary">{value}</p>
    </div>
  );
}
