"use client";

import { useMemo, useState } from "react";
import { Target } from "lucide-react";
import type { MoneybookState } from "@/lib/bookkeeping/transaction-engine";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";
import {
  getActiveTransactions,
  getMoneyTotals,
  getPeriodStart,
  getTransactionsForDay,
  getTransactionsSince,
} from "@/lib/dashboard/simple-insights";

type Goals = {
  dailySales: number;
  weeklyProfit: number;
  monthlyRevenue: number;
};

const defaultGoals: Goals = {
  dailySales: 50000,
  weeklyProfit: 100000,
  monthlyRevenue: 1000000,
};

export function BusinessGoals({ state }: { state: MoneybookState }) {
  const storageKey = `businessGoals:${state.businessId ?? "demo"}`;
  const [goals, setGoals] = useState(() => {
    if (typeof window === "undefined") {
      return defaultGoals;
    }

    const savedGoals = localStorage.getItem(storageKey);
    if (savedGoals) {
      return { ...defaultGoals, ...JSON.parse(savedGoals) };
    }

    return defaultGoals;
  });

  function updateGoal(key: keyof Goals, value: string) {
    const nextGoals = {
      ...goals,
      [key]: Math.max(0, Number(value) || 0),
    };
    setGoals(nextGoals);
    localStorage.setItem(storageKey, JSON.stringify(nextGoals));
  }

  const rows = useMemo(() => {
    const transactions = getActiveTransactions(state);
    const today = getMoneyTotals(getTransactionsForDay(transactions));
    const week = getMoneyTotals(getTransactionsSince(transactions, getPeriodStart("week")));
    const month = getMoneyTotals(getTransactionsSince(transactions, getPeriodStart("month")));

    return [
      { key: "dailySales" as const, label: "Daily sales", current: today.moneyIn, goal: goals.dailySales },
      { key: "weeklyProfit" as const, label: "Weekly profit", current: week.profit, goal: goals.weeklyProfit },
      { key: "monthlyRevenue" as const, label: "Monthly revenue", current: month.moneyIn, goal: goals.monthlyRevenue },
    ];
  }, [goals, state]);

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm md:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
          <Target size={20} aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-medium text-textSecondary">Simple goals</p>
          <h2 className="text-lg font-semibold tracking-tight text-textPrimary">Progress</h2>
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        {rows.map((row) => {
          const percent = row.goal > 0 ? Math.min(100, Math.round((row.current / row.goal) * 100)) : 0;

          return (
            <div key={row.key} className="rounded-2xl bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-textPrimary">{row.label}</p>
                  <p className="mt-1 text-xs text-textSecondary">
                    {formatNaira(row.current)} of {formatNaira(row.goal)}
                  </p>
                </div>
                <input
                  className="h-10 w-28 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  min="0"
                  inputMode="numeric"
                  type="number"
                  value={row.goal}
                  onChange={(event) => updateGoal(row.key, event.target.value)}
                  aria-label={`${row.label} goal`}
                />
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
              </div>
              <p className="mt-2 text-xs font-semibold text-textSecondary">{percent}% complete</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
