import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { TaxAssistantPanel } from "@/components/tax/TaxAssistantPanel";
import { phase3FeatureFlags } from "@/lib/phase3/feature-flags";

export default function TaxAssistantPage() {
  return (
    <main className="space-y-6 md:space-y-8">
      <header>
        <p className="text-sm font-semibold text-primary">Tax assistant</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">Review tax records</h1>
        <p className="mt-1 text-sm text-textSecondary md:text-base">
          Check settings, estimates, and accountant-ready summaries.
        </p>
      </header>
      {phase3FeatureFlags.taxAssistant ? (
        <TaxAssistantPanel />
      ) : (
        <FeatureUnavailablePanel
          title="Tax Assistant is not available"
          description="Phase 3H is behind a rollout flag while country rules, snapshots, and disclaimers are validated."
          billingLink={false}
        />
      )}
    </main>
  );
}
