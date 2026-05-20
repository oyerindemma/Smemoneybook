"use client";

import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { MoneybookState } from "@/lib/bookkeeping/transaction-engine";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";
import {
  getActiveTransactions,
  getMoneyTotals,
  getPeriodStart,
  getTransactionsSince,
} from "@/lib/dashboard/simple-insights";

export function CashflowSummary({ state }: { state: MoneybookState }) {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const totals = useMemo(() => {
    const start = getPeriodStart(period);
    return getMoneyTotals(getTransactionsSince(getActiveTransactions(state), start));
  }, [period, state]);

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-textSecondary">Cashflow</p>
          <h2 className="text-lg font-semibold tracking-tight text-textPrimary">
            Money movement
          </h2>
        </div>
        <div className="grid grid-cols-2 rounded-xl bg-background p-1">
          {(["week", "month"] as const).map((option) => (
            <button
              key={option}
              className={`min-h-10 rounded-lg px-3 text-xs font-semibold capitalize transition ${
                period === option ? "bg-primary text-white" : "text-textSecondary"
              }`}
              type="button"
              onClick={() => setPeriod(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <FlowMetric icon="in" label="Money In" value={totals.moneyIn} />
        <FlowMetric icon="out" label="Money Out" value={totals.moneyOut} />
        <div className="rounded-2xl bg-primary p-4 text-white">
          <p className="text-xs text-white/70">Remaining</p>
          <strong className="mt-2 block text-xl">{formatNaira(totals.remaining)}</strong>
        </div>
      </div>
    </section>
  );
}

function FlowMetric({
  icon,
  label,
  value,
}: {
  icon: "in" | "out";
  label: string;
  value: number;
}) {
  const Icon = icon === "in" ? ArrowDownLeft : ArrowUpRight;

  return (
    <div className="rounded-2xl bg-background p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-textSecondary">
        <Icon size={15} aria-hidden="true" />
        {label}
      </div>
      <strong className="mt-2 block text-lg text-textPrimary">{formatNaira(value)}</strong>
    </div>
  );
}
