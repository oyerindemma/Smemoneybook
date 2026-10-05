import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { TaxAssistantPanel } from "@/components/tax/TaxAssistantPanel";
import { phase3FeatureFlags } from "@/lib/phase3/feature-flags";
import { isTaxAssistantFeatureEnabledForServer } from "@/lib/tax-assistant/authorization";

export default function TaxAssistantPage() {
  const enabled = phase3FeatureFlags.taxAssistant && isTaxAssistantFeatureEnabledForServer();

  return (
    <main className="space-y-6 md:space-y-8">
      <header>
        <p className="text-sm font-semibold text-primary">Tax assistant</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">Review tax records</h1>
        <p className="mt-1 text-sm text-textSecondary md:text-base">
          Check settings, estimates, and accountant-ready summaries.
        </p>
      </header>
      {enabled ? (
        <TaxAssistantPanel />
      ) : (
        <FeatureUnavailablePanel
          title="Tax Assistant is not available"
          description="Phase 3C is behind Preview flags while AI controls, tax rules, and QA evidence are validated."
          billingLink={false}
        />
      )}
    </main>
  );
}
