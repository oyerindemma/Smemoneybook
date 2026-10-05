import { PredictiveAlertsPanel } from "@/components/alerts/PredictiveAlertsPanel";
import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { phase3FeatureFlags } from "@/lib/phase3/feature-flags";
import { isPredictiveAlertsFeatureEnabledForServer } from "@/lib/predictive-alerts/authorization";

export default function PredictiveAlertsPage() {
  const predictiveAlertsEnabled =
    phase3FeatureFlags.predictiveAlerts && isPredictiveAlertsFeatureEnabledForServer();

  return (
    <main className="space-y-6 md:space-y-8">
      <header>
        <p className="text-sm font-semibold text-primary">Predictive alerts</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">Business risk signals</h1>
        <p className="mt-1 text-sm text-textSecondary md:text-base">
          Review deterministic risk signals across cash flow, sales, expenses, stock, tax readiness, reconciliation, and setup.
        </p>
      </header>
      {predictiveAlertsEnabled ? (
        <PredictiveAlertsPanel />
      ) : (
        <FeatureUnavailablePanel
          title="Predictive Alerts are not available"
          description="Phase 3E stays behind Preview-only rollout flags while alert formulas, evidence, lifecycle, and false-positive handling are validated."
          billingLink={false}
        />
      )}
    </main>
  );
}
