import type {
  AiEvaluationCaseResult,
  AiEvaluationRunSummary,
} from "@/lib/ai-evaluation/definitions";

export type AiEvaluationExportRun = {
  id: string;
  suiteName: string;
  targetFeature: string;
  model: string;
  promptVersion: string;
  toolVersion: string;
  datasetVersion: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  summary: AiEvaluationRunSummary;
  results: AiEvaluationCaseResult[];
};

export function buildAiEvaluationCsv(run: AiEvaluationExportRun) {
  const rows = [
    [
      "run_id",
      "suite",
      "target_feature",
      "model",
      "prompt_version",
      "tool_version",
      "dataset_version",
      "status",
      "pass_rate",
      "aggregate_score",
      "critical_failures",
      "case_key",
      "case_status",
      "case_score",
      "latency_ms",
      "tokens",
      "estimated_cost_kobo",
      "failure_reason",
    ],
    ...run.results.map((result) => [
      run.id,
      run.suiteName,
      run.targetFeature,
      run.model,
      run.promptVersion,
      run.toolVersion,
      run.datasetVersion,
      run.status,
      run.summary.passRate,
      run.summary.aggregateScore,
      run.summary.criticalFailures,
      result.caseKey,
      result.status,
      result.score,
      result.latencyMs,
      result.tokenUsage.totalTokens,
      result.estimatedCostKobo,
      result.failureReason ?? "",
    ]),
  ];

  return rows.map((row) => row.map(csvValue).join(",")).join("\n");
}

export function redactAiEvaluationResponse(response: string) {
  return response
    .replace(/sk-[a-z0-9_-]+/gi, "[REDACTED_SECRET]")
    .replace(/postgres(ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/(?:token|password|secret)\s*[:=]\s*["']?[a-z0-9_-]+/gi, "[REDACTED_SECRET]");
}

function csvValue(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}
