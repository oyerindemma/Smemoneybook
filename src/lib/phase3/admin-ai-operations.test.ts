import { describe, expect, it } from "vitest";
import { summarizeAdminAiOperations } from "@/lib/phase3/admin-ai-operations";
import type { AiEvaluationSummary } from "@/lib/phase3/ai-evaluation";

const evaluationSummary: AiEvaluationSummary = {
  version: "ai-evaluation-v1",
  generatedAt: "2026-07-20T12:00:00.000Z",
  eventCount: 10,
  requestVolume: 4,
  feedbackCount: 3,
  helpfulRate: 66.67,
  recommendationAcceptanceRate: 50,
  categorizationAccuracy: 75,
  correctionRate: 33.33,
  toolFailureRate: 10,
  averageLatencyMs: 900,
  p95LatencyMs: 1_500,
  totalCostKobo: 250,
  averageCostKobo: 25,
  safetyEventCount: 1,
  datasetCount: 1,
  redactedDatasetCount: 1,
  consentRequiredDatasetCount: 1,
  evaluationRunCount: 1,
  failedEvaluationRunCount: 0,
  byFeature: [],
};

describe("Phase 3Q admin AI operations", () => {
  it("summarizes quality, anomaly precision, messaging, and operational risk", () => {
    const summary = summarizeAdminAiOperations({
      evaluationSummary,
      anomalyConfirmed: 8,
      anomalyIncorrect: 2,
      forecastAccuracyPercentages: [80, 90],
      whatsappSent: 90,
      whatsappFailed: 10,
      whatsappQueued: 0,
      bankImportFailures: 1,
      reconciliationBacklog: 30,
      taxAssistantUsage: 7,
      payrollFailures: 0,
      cooperativeArrears: 2,
      atRiskBusinesses: 3,
      customerSuccessInterventions: 1,
    });

    expect(summary.aiRequestVolume).toBe(4);
    expect(summary.anomalyPrecision).toBe(80);
    expect(summary.forecastAccuracyPercent).toBe(85);
    expect(summary.whatsappMessageHealth.failureRate).toBe(10);
    expect(summary.operationalStatus).toBe("Needs attention");
  });
});
