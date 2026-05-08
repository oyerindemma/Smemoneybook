"use client";

import { useState } from "react";
import { ReportsPanel } from "@/components/dashboard/ReportsPanel";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { SummaryCard } from "@/components/reports/SummaryCard";

export default function ReportsPage() {
  const { state, summary, setNotice, showUpgradePrompt } = useDashboard();
  const [showDetails, setShowDetails] = useState(false);

  return (
    <main className="space-y-8 md:space-y-10">
      <header>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Reports</h1>
        <p className="mt-1 text-sm text-textSecondary md:text-base">Simple view of this month.</p>
      </header>
      <SummaryCard summary={summary} onViewDetails={() => setShowDetails(true)} />
      <p className="rounded-2xl border border-gray-100 bg-card p-4 text-xs leading-5 text-textSecondary shadow-sm md:text-sm">
        Reports are informational and generated from recorded business data. Please verify before official filing, tax submission, or financial decision-making.
      </p>
      {showDetails ? (
        <ReportsPanel
          businessId={state.businessId}
          onNotice={setNotice}
          onUpgradePrompt={showUpgradePrompt}
        />
      ) : null}
    </main>
  );
}
