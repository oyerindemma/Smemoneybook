import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { ExecutiveDashboardPanel } from "@/components/executive/ExecutiveDashboardPanel";
import { phase3FeatureFlags } from "@/lib/phase3/feature-flags";
import { isExecutiveDashboardFeatureEnabledForServer } from "@/lib/executive-dashboard/authorization";

export default function ExecutiveDashboardPage() {
  const enabled = phase3FeatureFlags.executiveDashboard && isExecutiveDashboardFeatureEnabledForServer();

  return (
    <main className="space-y-6 md:space-y-8">
      <header>
        <p className="text-sm font-semibold text-primary">Executive dashboard</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">Owner decision view</h1>
        <p className="mt-1 text-sm text-textSecondary md:text-base">
          Review revenue, expenses, profit, cash, debt, stock value, and recommended actions.
        </p>
      </header>
      {enabled ? (
        <ExecutiveDashboardPanel />
      ) : (
        <FeatureUnavailablePanel
          title="Executive Dashboard is not available"
          description="Phase 3D is behind Preview flags while metric definitions, data freshness, and QA evidence are validated."
          billingLink={false}
        />
      )}
    </main>
  );
}
