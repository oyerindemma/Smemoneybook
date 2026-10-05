import {
  aiEvaluationAcceptanceThresholds,
  aiEvaluationEvaluatorVersion,
  aiEvaluationModuleVersion,
  type AiEvaluationCaseResult,
  type AiEvaluationEvaluatorResult,
  type AiEvaluationRunSummary,
} from "@/lib/ai-evaluation/definitions";

export function scoreEvaluationCase({
  caseKey,
  response,
  toolCalls,
  citations,
  evaluatorResults,
  latencyMs,
  tokenUsage,
  estimatedCostKobo,
}: Omit<AiEvaluationCaseResult, "status" | "score" | "criticalFailure" | "failureReason">): AiEvaluationCaseResult {
  const criticalFailure = evaluatorResults.some((result) => result.critical);
  const failed = evaluatorResults.filter((result) => !result.passed);
  const score = average(evaluatorResults.map((result) => result.score));
  const status = criticalFailure
    ? "critical_failure"
    : failed.length === 0
      ? "passed"
      : score >= aiEvaluationAcceptanceThresholds.categoryScore
        ? "needs_review"
        : "failed";

  return {
    caseKey,
    status,
    response,
    toolCalls,
    citations,
    evaluatorResults,
    score,
    criticalFailure,
    latencyMs,
    tokenUsage,
    estimatedCostKobo,
    failureReason: failed.length ? failed.map((result) => result.label).join(", ") : undefined,
  };
}

export function summarizeEvaluationRun({
  results,
  datasetVersion,
  model,
  promptVersion,
  toolVersion,
  evaluatorVersion = aiEvaluationEvaluatorVersion,
  status = "completed",
}: {
  results: AiEvaluationCaseResult[];
  datasetVersion: string;
  model: string;
  promptVersion: string;
  toolVersion: string;
  evaluatorVersion?: string;
  status?: AiEvaluationRunSummary["status"];
}): AiEvaluationRunSummary {
  const totalCases = results.length;
  const passedCases = results.filter((result) => result.status === "passed").length;
  const failedCases = results.filter((result) => result.status === "failed" || result.status === "critical_failure").length;
  const needsReviewCases = results.filter((result) => result.status === "needs_review").length;
  const criticalFailures = results.filter((result) => result.criticalFailure).length;
  const totalCostKobo = results.reduce((sum, result) => sum + result.estimatedCostKobo, 0);
  const totalTokens = results.reduce((sum, result) => sum + result.tokenUsage.totalTokens, 0);
  const latencies = results.map((result) => result.latencyMs).sort((left, right) => left - right);
  const aggregateScore = average(results.map((result) => result.score));
  const passRate = rate(passedCases + needsReviewCases, totalCases);
  const scoreBreakdown = buildScoreBreakdown(results);
  const averageLatencyMs = average(latencies);
  const p95LatencyMs = percentile(latencies, 0.95);
  const acceptableAsBaseline =
    status === "completed" &&
    criticalFailures === 0 &&
    aggregateScore >= aiEvaluationAcceptanceThresholds.aggregateScore &&
    passRate >= aiEvaluationAcceptanceThresholds.passRate &&
    averageLatencyMs <= aiEvaluationAcceptanceThresholds.maxAverageLatencyMs &&
    p95LatencyMs <= aiEvaluationAcceptanceThresholds.maxP95LatencyMs &&
    totalCostKobo <= aiEvaluationAcceptanceThresholds.maxRunCostKobo &&
    totalTokens <= aiEvaluationAcceptanceThresholds.maxRunTokens;

  return {
    version: aiEvaluationModuleVersion,
    datasetVersion,
    evaluatorVersion,
    model,
    promptVersion,
    toolVersion,
    status,
    totalCases,
    passedCases,
    failedCases,
    needsReviewCases,
    criticalFailures,
    passRate,
    aggregateScore,
    scoreBreakdown,
    totalCostKobo,
    totalTokens,
    averageLatencyMs,
    p95LatencyMs,
    acceptableAsBaseline,
  };
}

export function compareEvaluationRuns({
  baseline,
  candidate,
}: {
  baseline: AiEvaluationRunSummary;
  candidate: AiEvaluationRunSummary;
}) {
  const scoreDelta = round(candidate.aggregateScore - baseline.aggregateScore);
  const passRateDelta = round(candidate.passRate - baseline.passRate);
  const costDeltaKobo = candidate.totalCostKobo - baseline.totalCostKobo;
  const latencyDeltaMs = candidate.averageLatencyMs - baseline.averageLatencyMs;
  const regression =
    candidate.criticalFailures > baseline.criticalFailures ||
    scoreDelta <= -5 ||
    passRateDelta <= -5 ||
    latencyDeltaMs > 2_000 ||
    costDeltaKobo > 500;

  return {
    scoreDelta,
    passRateDelta,
    costDeltaKobo,
    latencyDeltaMs,
    regression,
  };
}

function buildScoreBreakdown(results: AiEvaluationCaseResult[]) {
  const grouped = new Map<string, AiEvaluationEvaluatorResult[]>();

  for (const result of results) {
    for (const evaluator of result.evaluatorResults) {
      grouped.set(evaluator.id, [...(grouped.get(evaluator.id) ?? []), evaluator]);
    }
  }

  return Object.fromEntries(
    Array.from(grouped.entries()).map(([key, evaluatorResults]) => [
      key,
      average(evaluatorResults.map((result) => result.score)),
    ]),
  );
}

function rate(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0;
  }

  return round((numerator / denominator) * 100);
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) {
    return 0;
  }

  const index = Math.min(values.length - 1, Math.ceil(values.length * percentileValue) - 1);
  return values[index];
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
