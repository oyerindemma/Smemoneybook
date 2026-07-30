import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { AiMarketingPanel } from "@/components/marketing/AiMarketingPanel";
import { isAiMarketingFeatureEnabledForServer } from "@/lib/ai-marketing/authorization";
import { phase3FeatureFlags } from "@/lib/phase3/feature-flags";

export default function AiMarketingPage() {
  const enabled = phase3FeatureFlags.aiMarketing && isAiMarketingFeatureEnabledForServer();

  return (
    <main className="space-y-6 md:space-y-8">
      <header>
        <p className="text-sm font-semibold text-primary">AI marketing</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">Consent-aware campaigns</h1>
        <p className="mt-1 text-sm text-textSecondary md:text-base">
          Segment customers, draft messages, preview eligibility, and require owner approval before any send attempt.
        </p>
      </header>
      {enabled ? (
        <AiMarketingPanel />
      ) : (
        <FeatureUnavailablePanel
          title="AI Marketing is not available"
          description="Phase 3H needs both public and server-side AI Marketing flags before owner-controlled campaign QA can run."
          billingLink={false}
        />
      )}
    </main>
  );
}
