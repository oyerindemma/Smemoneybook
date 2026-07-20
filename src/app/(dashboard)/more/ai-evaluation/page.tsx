import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { AiEvaluationPanel } from "@/components/evaluation/AiEvaluationPanel";
import { phase3FeatureFlags } from "@/lib/phase3/feature-flags";

export default function AiEvaluationPage() {
  return (
    <main className="space-y-6 md:space-y-8">
      <header>
        <p className="text-sm font-semibold text-primary">AI evaluation</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">Model quality controls</h1>
        <p className="mt-1 text-sm text-textSecondary md:text-base">
          Monitor AI feedback, recommendation acceptance, correctness, latency, cost, and safety signals.
        </p>
      </header>
      {phase3FeatureFlags.aiEvaluation ? (
        <AiEvaluationPanel />
      ) : (
        <FeatureUnavailablePanel
          title="AI Evaluation is not available"
          description="Phase 3P stays behind a rollout flag while feedback, regression, and safety telemetry are validated."
          billingLink={false}
        />
      )}
    </main>
  );
}
