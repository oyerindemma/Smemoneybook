"use client";

import Link from "next/link";
import { Bot } from "lucide-react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { BusinessGoals } from "@/components/dashboard/BusinessGoals";
import { BusinessHealthCard } from "@/components/dashboard/BusinessHealthCard";
import { BusinessTimeline } from "@/components/dashboard/BusinessTimeline";
import { CashflowSummary } from "@/components/dashboard/CashflowSummary";
import { DailySummaryCard } from "@/components/dashboard/DailySummaryCard";
import { LightweightAiInsights } from "@/components/dashboard/LightweightAiInsights";
import { SmartAlerts } from "@/components/dashboard/SmartAlerts";
import { ActivityFeed } from "@/components/money/ActivityFeed";
import { InsightStrip } from "@/components/money/InsightStrip";
import { MoneyCard } from "@/components/money/MoneyCard";
import { RecordMoneyButton } from "@/components/money/RecordMoneyButton";

export default function MoneyPage() {
  const {
    state,
    summary,
    todayActivityCount,
    openRecordModal,
    reverseActivity,
  } = useDashboard();

  return (
    <main className="space-y-8 md:space-y-10">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <DailySummaryCard state={state} />
        <BusinessHealthCard state={state} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SmartAlerts state={state} />
        <CashflowSummary state={state} />
      </div>
      <div className="grid gap-6 md:gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)] lg:items-start">
        <div className="space-y-5 md:space-y-6">
          <MoneyCard summary={summary} />
          <Link
            className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-card p-5 shadow-sm transition-all duration-150 hover:shadow-md active:scale-[0.99]"
            href="/assistant"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Bot size={20} aria-hidden="true" />
            </span>
            <span>
              <span className="block font-semibold text-textPrimary">Ask MoneyBook Assistant</span>
              <span className="mt-1 block text-sm text-textSecondary">
                Ask about sales, debt, stock, or reports.
              </span>
            </span>
          </Link>
          <RecordMoneyButton />
        </div>
        <InsightStrip
          summary={summary}
          activityCount={todayActivityCount}
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <BusinessGoals state={state} />
        <LightweightAiInsights state={state} />
      </div>
      <BusinessTimeline state={state} />
      <ActivityFeed
        transactions={state.transactions}
        onReverse={reverseActivity}
        canReverse={state.permissions?.canManageAccounts ?? false}
        onRecord={openRecordModal}
      />
    </main>
  );
}
