"use client";

import { useState } from "react";
import { ReportsPanel } from "@/components/dashboard/ReportsPanel";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { ReportCataloguePanel } from "@/components/reports/ReportCataloguePanel";
import { SummaryCard } from "@/components/reports/SummaryCard";
import { canShowPhase2Navigation } from "@/lib/phase2/client-access";

export default function ReportsPage() {
  const { state, summary, setNotice, showUpgradePrompt } = useDashboard();
  const [showDetails, setShowDetails] = useState(true);
  const canUseAdvancedReports = canShowPhase2Navigation({
    state,
    flag: "reportingCentre",
    entitlement: "advanced_reports",
    permission: "canSaveReports",
  });

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
      {canUseAdvancedReports ? (
        <ReportCataloguePanel />
      ) : (
        <FeatureUnavailablePanel
          title="Advanced reports are not available"
          description="This business needs the Reporting Centre flag, reports permission, and a plan with advanced reports."
        />
      )}
      {showDetails ? (
        <ReportsPanel
          businessId={state.businessId}
          locationId={state.selectedLocationId}
          locationName={state.selectedLocationName}
          onNotice={setNotice}
          onUpgradePrompt={showUpgradePrompt}
        />
      ) : null}
    </main>
  );
}
