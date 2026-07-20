export const aiEvaluationVersion = "ai-evaluation-v1";

export type AiEvaluationEventInput = {
  feature: string;
  eventType: string;
  rating?: string | null;
  accepted?: boolean | null;
  correct?: boolean | null;
  latencyMs?: number | null;
  costKobo?: number | null;
  toolName?: string | null;
  safetyLabel?: string | null;
  correction?: string | null;
  createdAt: Date;
};

export type AiEvaluationDatasetInput = {
  piiRedacted: boolean;
  consentRequired: boolean;
  sampleCount: number;
};

export type AiEvaluationRunInput = {
  status: string;
  metrics?: unknown;
  createdAt: Date;
};

export type AiEvaluationSummary = {
  version: typeof aiEvaluationVersion;
  generatedAt: string;
  eventCount: number;
  requestVolume: number;
  feedbackCount: number;
  helpfulRate: number | null;
  recommendationAcceptanceRate: number | null;
  categorizationAccuracy: number | null;
  correctionRate: number | null;
  toolFailureRate: number | null;
  averageLatencyMs: number | null;
  p95LatencyMs: number | null;
  totalCostKobo: number;
  averageCostKobo: number | null;
  safetyEventCount: number;
  datasetCount: number;
  redactedDatasetCount: number;
  consentRequiredDatasetCount: number;
  evaluationRunCount: number;
  failedEvaluationRunCount: number;
  byFeature: Array<{
    feature: string;
    eventCount: number;
    feedbackCount: number;
    acceptanceRate: number | null;
    correctnessRate: number | null;
    totalCostKobo: number;
  }>;
};

export function calculateAiEvaluationSummary({
  events,
  datasets = [],
  runs = [],
  generatedAt = new Date(),
}: {
  events: AiEvaluationEventInput[];
  datasets?: AiEvaluationDatasetInput[];
  runs?: AiEvaluationRunInput[];
  generatedAt?: Date;
}): AiEvaluationSummary {
  const feedbackEvents = events.filter(isFeedbackEvent);
  const helpfulEvents = feedbackEvents.filter((event) => event.rating === "helpful" || event.rating === "correct");
  const unhelpfulEvents = feedbackEvents.filter((event) => event.rating === "not_helpful" || event.rating === "incorrect");
  const acceptanceEvents = events.filter((event) => typeof event.accepted === "boolean");
  const correctnessEvents = events.filter((event) => typeof event.correct === "boolean");
  const correctionEvents = events.filter((event) => Boolean(event.correction?.trim()));
  const toolEvents = events.filter((event) => event.eventType === "tool_call" || event.eventType === "tool_failure");
  const toolFailures = toolEvents.filter((event) => event.eventType === "tool_failure" || event.rating === "failed");
  const latencies = events.map((event) => cleanPositive(event.latencyMs)).filter((value): value is number => value !== null).sort((a, b) => a - b);
  const costs = events.map((event) => cleanPositive(event.costKobo)).filter((value): value is number => value !== null);
  const byFeature = buildFeatureSummary(events);

  return {
    version: aiEvaluationVersion,
    generatedAt: generatedAt.toISOString(),
    eventCount: events.length,
    requestVolume: events.filter((event) => event.eventType === "request").length,
    feedbackCount: feedbackEvents.length,
    helpfulRate: rate(helpfulEvents.length, helpfulEvents.length + unhelpfulEvents.length),
    recommendationAcceptanceRate: rate(
      acceptanceEvents.filter((event) => event.accepted === true).length,
      acceptanceEvents.length,
    ),
    categorizationAccuracy: rate(
      correctnessEvents.filter((event) => event.correct === true).length,
      correctnessEvents.length,
    ),
    correctionRate: rate(correctionEvents.length, feedbackEvents.length),
    toolFailureRate: rate(toolFailures.length, toolEvents.length),
    averageLatencyMs: average(latencies),
    p95LatencyMs: percentile(latencies, 0.95),
    totalCostKobo: costs.reduce((sum, value) => sum + value, 0),
    averageCostKobo: average(costs),
    safetyEventCount: events.filter((event) => event.safetyLabel && event.safetyLabel !== "none").length,
    datasetCount: datasets.length,
    redactedDatasetCount: datasets.filter((dataset) => dataset.piiRedacted).length,
    consentRequiredDatasetCount: datasets.filter((dataset) => dataset.consentRequired).length,
    evaluationRunCount: runs.length,
    failedEvaluationRunCount: runs.filter((run) => run.status === "failed").length,
    byFeature,
  };
}

function buildFeatureSummary(events: AiEvaluationEventInput[]) {
  const grouped = new Map<string, AiEvaluationEventInput[]>();

  for (const event of events) {
    grouped.set(event.feature, [...(grouped.get(event.feature) ?? []), event]);
  }

  return Array.from(grouped.entries())
    .map(([feature, featureEvents]) => {
      const acceptanceEvents = featureEvents.filter((event) => typeof event.accepted === "boolean");
      const correctnessEvents = featureEvents.filter((event) => typeof event.correct === "boolean");

      return {
        feature,
        eventCount: featureEvents.length,
        feedbackCount: featureEvents.filter(isFeedbackEvent).length,
        acceptanceRate: rate(
          acceptanceEvents.filter((event) => event.accepted === true).length,
          acceptanceEvents.length,
        ),
        correctnessRate: rate(
          correctnessEvents.filter((event) => event.correct === true).length,
          correctnessEvents.length,
        ),
        totalCostKobo: featureEvents.reduce((sum, event) => sum + (cleanPositive(event.costKobo) ?? 0), 0),
      };
    })
    .sort((left, right) => right.eventCount - left.eventCount);
}

function isFeedbackEvent(event: AiEvaluationEventInput) {
  return event.eventType === "feedback";
}

function cleanPositive(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
}

function rate(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return null;
  }

  return Math.round((numerator / denominator) * 10_000) / 100;
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) {
    return null;
  }

  const index = Math.min(values.length - 1, Math.ceil(values.length * percentileValue) - 1);
  return values[index];
}
