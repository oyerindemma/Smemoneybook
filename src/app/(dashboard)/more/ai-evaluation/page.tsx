import { FeatureUnavailablePanel } from "@/components/dashboard/FeatureUnavailablePanel";
import { AiEvaluationPanel } from "@/components/evaluation/AiEvaluationPanel";
import { isAiEvaluationFeatureEnabledForServer } from "@/lib/ai-evaluation/authorization";
import { phase3FeatureFlags } from "@/lib/phase3/feature-flags";

export default function AiEvaluationPage() {
  const enabled = phase3FeatureFlags.aiEvaluation && isAiEvaluationFeatureEnabledForServer();

  return (
    <main className="space-y-6 md:space-y-8">
      <header>
        <p className="text-sm font-semibold text-primary">AI evaluation</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">Model quality controls</h1>
        <p className="mt-1 text-sm text-textSecondary md:text-base">
          Run internal safety, grounding, regression, latency, and cost checks before AI rollout.
        </p>
      </header>
      {enabled ? (
        <AiEvaluationPanel />
      ) : (
        <FeatureUnavailablePanel
          title="AI Evaluation is not available"
          description="Phase 3F needs both public and server-side AI Evaluation flags before authorized internal or owner-admin users can open it."
          billingLink={false}
        />
      )}
    </main>
  );
}
