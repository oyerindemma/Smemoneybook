import { describe, expect, it } from "vitest";
import { getDefaultAiEvaluationCases, getSyntheticProviderOutput } from "@/lib/ai-evaluation/datasets";
import { evaluateAiEvaluationCase } from "@/lib/ai-evaluation/evaluators";
import { compareEvaluationRuns, scoreEvaluationCase, summarizeEvaluationRun } from "@/lib/ai-evaluation/scoring";
import type { AiEvaluationCaseResult } from "@/lib/ai-evaluation/definitions";

const cases = getDefaultAiEvaluationCases();

describe("Phase 3F AI evaluation scoring", () => {
  it("summarizes a passing deterministic suite as baseline eligible", () => {
    const results = cases.map((caseDefinition) => {
      const output = getSyntheticProviderOutput(caseDefinition.key);
      return scoreEvaluationCase({
        caseKey: caseDefinition.key,
        response: output.response,
        toolCalls: output.toolCalls,
        citations: output.citations,
        evaluatorResults: evaluateAiEvaluationCase(caseDefinition, output),
        latencyMs: output.latencyMs,
        tokenUsage: output.tokenUsage,
        estimatedCostKobo: output.estimatedCostKobo,
      });
    });
    const summary = summarizeEvaluationRun({
      results,
      datasetVersion: "phase3f-synthetic-v1",
      model: "deterministic-grounded-preview",
      promptVersion: "phase3f-evaluation-preview-v1",
      toolVersion: "phase3-ai-tools-v1",
    });

    expect(summary.totalCases).toBeGreaterThanOrEqual(15);
    expect(summary.criticalFailures).toBe(0);
    expect(summary.passRate).toBeGreaterThanOrEqual(85);
    expect(summary.acceptableAsBaseline).toBe(true);
  });

  it("critical failures override aggregate score and block baseline acceptance", () => {
    const result = caseResult({ status: "critical_failure", score: 99, criticalFailure: true });
    const summary = summarizeEvaluationRun({
      results: [result],
      datasetVersion: "phase3f-synthetic-v1",
      model: "model-a",
      promptVersion: "prompt-a",
      toolVersion: "tools-a",
    });

    expect(summary.aggregateScore).toBe(99);
    expect(summary.criticalFailures).toBe(1);
    expect(summary.acceptableAsBaseline).toBe(false);
  });

  it("detects regression across prompt and model versions", () => {
    const baseline = summarizeEvaluationRun({
      results: [caseResult({ score: 96, latencyMs: 500, estimatedCostKobo: 20 })],
      datasetVersion: "phase3f-synthetic-v1",
      model: "model-a",
      promptVersion: "prompt-a",
      toolVersion: "tools-a",
    });
    const candidate = summarizeEvaluationRun({
      results: [caseResult({ score: 80, latencyMs: 4_000, estimatedCostKobo: 900 })],
      datasetVersion: "phase3f-synthetic-v1",
      model: "model-b",
      promptVersion: "prompt-b",
      toolVersion: "tools-a",
    });

    expect(compareEvaluationRuns({ baseline, candidate })).toMatchObject({
      regression: true,
      scoreDelta: -16,
    });
  });
});

function caseResult({
  status = "passed",
  score = 100,
  criticalFailure = false,
  latencyMs = 300,
  estimatedCostKobo = 10,
}: Partial<AiEvaluationCaseResult>): AiEvaluationCaseResult {
  return {
    caseKey: "case_1",
    status,
    response: "Recorded answer.",
    toolCalls: [],
    citations: [],
    evaluatorResults: [
      {
        id: "business_isolation",
        label: "Business isolation",
        passed: !criticalFailure,
        score,
        critical: criticalFailure,
        detail: "Synthetic detail.",
      },
    ],
    score,
    criticalFailure,
    latencyMs,
    tokenUsage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    estimatedCostKobo,
  };
}
