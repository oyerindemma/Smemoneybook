import { ShieldCheck } from "lucide-react";
import type { MoneybookState } from "@/lib/bookkeeping/transaction-engine";
import { getBusinessHealth, type SimpleStatus } from "@/lib/dashboard/simple-insights";

export function BusinessHealthCard({ state }: { state: MoneybookState }) {
  const items = getBusinessHealth(state);

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm md:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck size={20} aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-medium text-textSecondary">Business health</p>
          <h2 className="text-lg font-semibold tracking-tight text-textPrimary">
            Quick check
          </h2>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className="rounded-2xl bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-textPrimary">{item.label}</p>
              <StatusPill status={item.status} />
            </div>
            <p className="mt-2 text-sm leading-5 text-textSecondary">{item.helper}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: SimpleStatus }) {
  const className = {
    Healthy: "bg-success/10 text-success",
    Warning: "bg-accent/15 text-textPrimary",
    "Needs Attention": "bg-danger/10 text-danger",
  }[status];

  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {status}
    </span>
  );
}
