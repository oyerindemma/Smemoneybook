import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { ExecutiveDashboardPanel } from "@/components/executive/ExecutiveDashboardPanel";
import { phase3FeatureFlags } from "@/lib/phase3/feature-flags";

export default function ExecutiveDashboardPage() {
  return (
    <main className="space-y-6 md:space-y-8">
      <header>
        <p className="text-sm font-semibold text-primary">Executive dashboard</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">Owner decision view</h1>
        <p className="mt-1 text-sm text-textSecondary md:text-base">
          Review revenue, expenses, profit, cash, debt, stock value, and recommended actions.
        </p>
      </header>
      {phase3FeatureFlags.executiveDashboard ? (
        <ExecutiveDashboardPanel />
      ) : (
        <FeatureUnavailablePanel
          title="Executive Dashboard is not available"
          description="Phase 3N is behind a rollout flag while metric definitions, data freshness, and cached summaries are validated."
          billingLink={false}
        />
      )}
    </main>
  );
}
