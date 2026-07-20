import { describe, expect, it } from "vitest";
import { calculateAiEvaluationSummary } from "@/lib/phase3/ai-evaluation";

describe("Phase 3P AI evaluation", () => {
  it("calculates feedback, acceptance, correctness, latency, and cost metrics", () => {
    const summary = calculateAiEvaluationSummary({
      generatedAt: new Date("2026-07-20T12:00:00.000Z"),
      events: [
        {
          feature: "phase3b_ai_advisor",
          eventType: "request",
          latencyMs: 100,
          costKobo: 20,
          createdAt: new Date("2026-07-20T10:00:00.000Z"),
        },
        {
          feature: "phase3b_ai_advisor",
          eventType: "feedback",
          rating: "helpful",
          correct: true,
          createdAt: new Date("2026-07-20T10:01:00.000Z"),
        },
        {
          feature: "phase3o_predictive_alerts",
          eventType: "feedback",
          rating: "incorrect",
          accepted: false,
          correct: false,
          correction: "Wrong period.",
          createdAt: new Date("2026-07-20T10:02:00.000Z"),
        },
        {
          feature: "phase3b_ai_advisor",
          eventType: "tool_failure",
          toolName: "get_profit",
          rating: "failed",
          latencyMs: 300,
          costKobo: 0,
          safetyLabel: "none",
          createdAt: new Date("2026-07-20T10:03:00.000Z"),
        },
      ],
      datasets: [{ piiRedacted: true, consentRequired: true, sampleCount: 4 }],
      runs: [{ status: "failed", metrics: {}, createdAt: new Date("2026-07-20T10:04:00.000Z") }],
    });

    expect(summary.eventCount).toBe(4);
    expect(summary.requestVolume).toBe(1);
    expect(summary.helpfulRate).toBe(50);
    expect(summary.recommendationAcceptanceRate).toBe(0);
    expect(summary.categorizationAccuracy).toBe(50);
    expect(summary.correctionRate).toBe(50);
    expect(summary.toolFailureRate).toBe(100);
    expect(summary.averageLatencyMs).toBe(200);
    expect(summary.totalCostKobo).toBe(20);
    expect(summary.datasetCount).toBe(1);
    expect(summary.failedEvaluationRunCount).toBe(1);
  });
});
