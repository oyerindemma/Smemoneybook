import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { isPhase3FeatureEnabled } from "@/lib/phase3/feature-flags";
import {
  calculateAiEvaluationSummary,
  type AiEvaluationSummary,
} from "@/lib/phase3/ai-evaluation";

export type AiEvaluationEventPayload = {
  businessId?: string;
  actorId?: string;
  feature: string;
  artifactType: string;
  artifactId?: string;
  eventType: string;
  rating?: string;
  accepted?: boolean;
  correct?: boolean;
  correction?: string;
  modelVersion?: string;
  promptVersion?: string;
  toolName?: string;
  latencyMs?: number;
  costKobo?: number;
  safetyLabel?: string;
  metadata?: Record<string, unknown>;
};

export type AiEvaluationOverview = {
  summary: AiEvaluationSummary;
  recentEvents: Array<{
    id: string;
    feature: string;
    eventType: string;
    artifactType: string;
    rating?: string;
    accepted?: boolean;
    correct?: boolean;
    modelVersion?: string;
    promptVersion?: string;
    toolName?: string;
    latencyMs?: number;
    costKobo?: number;
    safetyLabel?: string;
    createdAt: string;
  }>;
  datasets: Array<{
    id: string;
    name: string;
    purpose: string;
    source: string;
    retentionPolicy: string;
    piiRedacted: boolean;
    consentRequired: boolean;
    sampleCount: number;
    createdAt: string;
  }>;
  runs: Array<{
    id: string;
    modelVersion: string;
    promptVersion: string;
    evaluatorVersion: string;
    status: string;
    createdAt: string;
    completedAt?: string;
  }>;
};

export async function recordAiEvaluationEvent(input: AiEvaluationEventPayload) {
  return getPrisma().aiEvaluationEvent.create({
    data: {
      businessId: input.businessId,
      actorId: input.actorId,
      feature: input.feature,
      artifactType: input.artifactType,
      artifactId: input.artifactId,
      eventType: input.eventType,
      rating: input.rating,
      accepted: input.accepted,
      correct: input.correct,
      correction: input.correction,
      modelVersion: input.modelVersion,
      promptVersion: input.promptVersion,
      toolName: input.toolName,
      latencyMs: cleanInteger(input.latencyMs),
      costKobo: cleanInteger(input.costKobo),
      safetyLabel: input.safetyLabel,
      metadata: input.metadata ? toJson(input.metadata) : undefined,
    },
  });
}

export async function maybeRecordAiEvaluationEvent(input: AiEvaluationEventPayload) {
  if (!isPhase3FeatureEnabled("aiEvaluation")) {
    return null;
  }

  try {
    return await recordAiEvaluationEvent(input);
  } catch (error) {
    console.warn("ai_evaluation.event_failed", error);
    return null;
  }
}

export async function getAiEvaluationOverview({
  businessId,
  since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
}: {
  businessId?: string;
  since?: Date;
}): Promise<AiEvaluationOverview> {
  const prisma = getPrisma();
  const where = {
    ...(businessId ? { businessId } : {}),
    createdAt: { gte: since },
  };
  const [events, datasets, runs] = await Promise.all([
    prisma.aiEvaluationEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 1_000,
    }),
    prisma.aiEvaluationDataset.findMany({
      where: businessId ? { businessId } : {},
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.aiEvaluationRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  const summary = calculateAiEvaluationSummary({
    events: events.map((event) => ({
      feature: event.feature,
      eventType: event.eventType,
      rating: event.rating,
      accepted: event.accepted,
      correct: event.correct,
      correction: event.correction,
      latencyMs: event.latencyMs,
      costKobo: event.costKobo,
      toolName: event.toolName,
      safetyLabel: event.safetyLabel,
      createdAt: event.createdAt,
    })),
    datasets: datasets.map((dataset) => ({
      piiRedacted: dataset.piiRedacted,
      consentRequired: dataset.consentRequired,
      sampleCount: dataset.sampleCount,
    })),
    runs: runs.map((run) => ({
      status: run.status,
      metrics: run.metrics,
      createdAt: run.createdAt,
    })),
  });

  return {
    summary,
    recentEvents: events.slice(0, 25).map((event) => ({
      id: event.id,
      feature: event.feature,
      eventType: event.eventType,
      artifactType: event.artifactType,
      rating: event.rating ?? undefined,
      accepted: event.accepted ?? undefined,
      correct: event.correct ?? undefined,
      modelVersion: event.modelVersion ?? undefined,
      promptVersion: event.promptVersion ?? undefined,
      toolName: event.toolName ?? undefined,
      latencyMs: event.latencyMs ?? undefined,
      costKobo: event.costKobo ?? undefined,
      safetyLabel: event.safetyLabel ?? undefined,
      createdAt: event.createdAt.toISOString(),
    })),
    datasets: datasets.map((dataset) => ({
      id: dataset.id,
      name: dataset.name,
      purpose: dataset.purpose,
      source: dataset.source,
      retentionPolicy: dataset.retentionPolicy,
      piiRedacted: dataset.piiRedacted,
      consentRequired: dataset.consentRequired,
      sampleCount: dataset.sampleCount,
      createdAt: dataset.createdAt.toISOString(),
    })),
    runs: runs.map((run) => ({
      id: run.id,
      modelVersion: run.modelVersion,
      promptVersion: run.promptVersion,
      evaluatorVersion: run.evaluatorVersion,
      status: run.status,
      createdAt: run.createdAt.toISOString(),
      completedAt: run.completedAt?.toISOString(),
    })),
  };
}

export async function createAiEvaluationDataset({
  businessId,
  name,
  description,
  purpose,
  source,
  retentionPolicy,
  piiRedacted,
  consentRequired,
  sampleCount,
}: {
  businessId?: string;
  name: string;
  description?: string;
  purpose: string;
  source: string;
  retentionPolicy: string;
  piiRedacted: boolean;
  consentRequired: boolean;
  sampleCount: number;
}) {
  return getPrisma().aiEvaluationDataset.create({
    data: {
      businessId,
      name,
      description,
      purpose,
      source,
      retentionPolicy,
      piiRedacted,
      consentRequired,
      sampleCount: Math.max(0, sampleCount),
    },
  });
}

export async function recordAiEvaluationRun({
  businessId,
  datasetId,
  modelVersion,
  promptVersion,
  evaluatorVersion,
  status,
  metrics,
  safetyFindings,
}: {
  businessId?: string;
  datasetId?: string;
  modelVersion: string;
  promptVersion: string;
  evaluatorVersion: string;
  status: "queued" | "running" | "completed" | "failed";
  metrics: Record<string, unknown>;
  safetyFindings?: Record<string, unknown>;
}) {
  return getPrisma().aiEvaluationRun.create({
    data: {
      businessId,
      datasetId,
      modelVersion,
      promptVersion,
      evaluatorVersion,
      status,
      completedAt: status === "completed" || status === "failed" ? new Date() : undefined,
      metrics: toJson(metrics),
      safetyFindings: safetyFindings ? toJson(safetyFindings) : undefined,
    },
  });
}

function cleanInteger(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return Math.round(value);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
