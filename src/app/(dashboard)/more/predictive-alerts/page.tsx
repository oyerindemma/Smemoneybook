import { PredictiveAlertsPanel } from "@/components/alerts/PredictiveAlertsPanel";
import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { phase3FeatureFlags } from "@/lib/phase3/feature-flags";

export default function PredictiveAlertsPage() {
  return (
    <main className="space-y-6 md:space-y-8">
      <header>
        <p className="text-sm font-semibold text-primary">Predictive alerts</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">Business risk signals</h1>
        <p className="mt-1 text-sm text-textSecondary md:text-base">
          Review revenue, expense, customer, stock, cash, and demand anomalies with source metrics.
        </p>
      </header>
      {phase3FeatureFlags.predictiveAlerts ? (
        <PredictiveAlertsPanel />
      ) : (
        <FeatureUnavailablePanel
          title="Predictive Alerts are not available"
          description="Phase 3O stays behind a rollout flag while alert precision, source periods, and false-positive handling are validated."
          billingLink={false}
        />
      )}
    </main>
  );
}
