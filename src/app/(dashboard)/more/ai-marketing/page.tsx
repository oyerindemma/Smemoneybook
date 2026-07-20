import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { AiMarketingPanel } from "@/components/marketing/AiMarketingPanel";
import { phase3FeatureFlags } from "@/lib/phase3/feature-flags";

export default function AiMarketingPage() {
  return (
    <main className="space-y-6 md:space-y-8">
      <header>
        <p className="text-sm font-semibold text-primary">AI marketing</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">Draft promotional content</h1>
        <p className="mt-1 text-sm text-textSecondary md:text-base">
          Generate draft-only messages that must be reviewed before publishing or sending.
        </p>
      </header>
      {phase3FeatureFlags.aiMarketing ? (
        <AiMarketingPanel />
      ) : (
        <FeatureUnavailablePanel
          title="AI Marketing is not available"
          description="Phase 3M is behind a rollout flag while draft safety, review controls, and feedback loops are validated."
          billingLink={false}
        />
      )}
    </main>
  );
}
