import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  getDefaultAiEvaluationDataset,
  getSyntheticProviderOutput,
} from "@/lib/ai-evaluation/datasets";
import {
  aiEvaluationAcceptanceThresholds,
  aiEvaluationDatasetVersion,
  aiEvaluationDefaultModel,
  aiEvaluationEvaluatorVersion,
  aiEvaluationToolVersion,
  type AiEvaluationCaseDefinition,
  type AiEvaluationCaseResult,
  type AiEvaluationProviderOutput,
  type AiEvaluationRunSummary,
  type AiEvaluationTargetFeature,
} from "@/lib/ai-evaluation/definitions";
import { evaluateAiEvaluationCase } from "@/lib/ai-evaluation/evaluators";
import { redactAiEvaluationResponse } from "@/lib/ai-evaluation/report";
import {
  compareEvaluationRuns,
  scoreEvaluationCase,
  summarizeEvaluationRun,
} from "@/lib/ai-evaluation/scoring";
import { AiEvaluationDomainError } from "@/lib/ai-evaluation/api";

export type AiEvaluationProvider = {
  name: string;
  model: string;
  promptVersion: string;
  evaluateCase: (caseDefinition: AiEvaluationCaseDefinition) => Promise<AiEvaluationProviderOutput>;
};

export class TransientAiEvaluationProviderError extends Error {
  constructor(message = "Transient provider error.") {
    super(message);
    this.name = "TransientAiEvaluationProviderError";
  }
}

export function createSyntheticAiEvaluationProvider(): AiEvaluationProvider {
  const attempts = new Map<string, number>();

  return {
    name: "synthetic-deterministic",
    model: aiEvaluationDefaultModel,
    promptVersion: "phase3f-evaluation-preview-v1",
    async evaluateCase(caseDefinition) {
      const attempt = attempts.get(caseDefinition.key) ?? 0;
      attempts.set(caseDefinition.key, attempt + 1);

      if (caseDefinition.key === "provider_failure_retry" && attempt === 0) {
        throw new TransientAiEvaluationProviderError();
      }

      return getSyntheticProviderOutput(caseDefinition.key);
    },
  };
}

export function getAiEvaluationProviderSetupStatus() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  const configured = Boolean(
    apiKey &&
      model &&
      apiKey !== "[SENSITIVE]" &&
      model !== "[SENSITIVE]" &&
      !apiKey.includes("xxx"),
  );

  return {
    configured,
    model: configured ? model : null,
    deterministicProviderAvailable: true,
  };
}

export async function createDefaultAiEvaluationSuite({
  businessId,
  createdByUserId,
  targetFeature = "all_ai_surfaces",
  name,
  description,
}: {
  businessId: string;
  createdByUserId: string;
  targetFeature?: AiEvaluationTargetFeature;
  name?: string;
  description?: string;
}) {
  const dataset = getDefaultAiEvaluationDataset(targetFeature);
  const suite = await getPrisma().aiEvaluationSuite.create({
    data: {
      businessId,
      name: name?.trim() || dataset.name,
      description: description?.trim() || dataset.description,
      targetFeature,
      status: "active",
      datasetVersion: dataset.version,
      createdByUserId,
      cases: {
        create: dataset.cases.map((item) => ({
          key: item.key,
          category: item.category,
          prompt: item.prompt,
          fixtureReference: item.fixtureReference,
          expectedToolNames: item.expectedToolNames,
          forbiddenToolNames: item.forbiddenToolNames,
          expectedFacts: item.expectedFacts ? toJson(item.expectedFacts) : undefined,
          expectedRefusal: Boolean(item.expectedRefusal),
          scoringConfig: toJson(item.scoringConfig),
        })),
      },
    },
    include: {
      cases: { orderBy: { key: "asc" } },
      _count: { select: { cases: true, runs: true } },
    },
  });

  return serializeSuite(suite);
}

export async function listAiEvaluationSuites({
  businessId,
  targetFeature,
  status,
  limit = 50,
}: {
  businessId: string;
  targetFeature?: AiEvaluationTargetFeature;
  status?: string;
  limit?: number;
}) {
  const suites = await getPrisma().aiEvaluationSuite.findMany({
    where: {
      businessId,
      ...(targetFeature ? { targetFeature } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      _count: { select: { cases: true, runs: true } },
      runs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          cancelledAt: true,
          completedAt: true,
          summary: true,
          createdAt: true,
        },
      },
    },
  });

  return suites.map((suite) => ({
    ...serializeSuite(suite),
    latestRun: suite.runs[0]
      ? {
          id: suite.runs[0].id,
          status: displayRunStatus(suite.runs[0]),
          summary: readSummary(suite.runs[0].summary),
          createdAt: suite.runs[0].createdAt.toISOString(),
          completedAt: suite.runs[0].completedAt?.toISOString(),
        }
      : null,
  }));
}

export async function getAiEvaluationSuiteDetail({
  businessId,
  suiteId,
}: {
  businessId: string;
  suiteId: string;
}) {
  const suite = await getPrisma().aiEvaluationSuite.findFirst({
    where: { id: suiteId, businessId },
    include: {
      cases: { orderBy: { key: "asc" } },
      runs: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          modelVersion: true,
          model: true,
          promptVersion: true,
          toolVersion: true,
          datasetVersion: true,
          summary: true,
          totalCost: true,
          totalTokens: true,
          startedAt: true,
          completedAt: true,
          cancelledAt: true,
        },
      },
      _count: { select: { cases: true, runs: true } },
    },
  });

  if (!suite) {
    throw new AiEvaluationDomainError("AI evaluation suite was not found.", 404, "suite_not_found");
  }

  return {
    ...serializeSuite(suite),
    cases: suite.cases.map(serializeCase),
    runs: suite.runs.map(serializeRunListItem),
  };
}

export async function runAiEvaluationSuite({
  businessId,
  suiteId,
  initiatedByUserId,
  model,
  promptVersion,
  defer = false,
  provider = createSyntheticAiEvaluationProvider(),
}: {
  businessId: string;
  suiteId: string;
  initiatedByUserId: string;
  model?: string;
  promptVersion?: string;
  defer?: boolean;
  provider?: AiEvaluationProvider;
}) {
  const suite = await getPrisma().aiEvaluationSuite.findFirst({
    where: { id: suiteId, businessId },
    include: { cases: { orderBy: { key: "asc" } } },
  });

  if (!suite) {
    throw new AiEvaluationDomainError("AI evaluation suite was not found.", 404, "suite_not_found");
  }

  if (suite.cases.length === 0) {
    throw new AiEvaluationDomainError("Add cases before running this suite.", 400, "suite_empty");
  }

  const selectedModel = model?.trim() || provider.model;
  const selectedPromptVersion = promptVersion?.trim() || provider.promptVersion;
  const run = await getPrisma().aiEvaluationRun.create({
    data: {
      businessId,
      suiteId: suite.id,
      modelVersion: selectedModel,
      model: selectedModel,
      promptVersion: selectedPromptVersion,
      toolVersion: aiEvaluationToolVersion,
      datasetVersion: suite.datasetVersion,
      evaluatorVersion: aiEvaluationEvaluatorVersion,
      status: defer ? "queued" : "running",
      initiatedByUserId,
      metrics: toJson({ status: defer ? "queued" : "running" }),
      summary: toJson({ status: defer ? "queued" : "running" }),
    },
  });

  if (defer) {
    return getAiEvaluationRunDetail({ businessId, runId: run.id });
  }

  try {
    const caseDefinitions = suite.cases.map(caseFromRecord);
    const results = await executeCaseBatch({
      runId: run.id,
      cases: caseDefinitions,
      provider,
    });
    const summary = summarizeEvaluationRun({
      results,
      datasetVersion: suite.datasetVersion,
      model: selectedModel,
      promptVersion: selectedPromptVersion,
      toolVersion: aiEvaluationToolVersion,
    });

    await getPrisma().aiEvaluationRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        metrics: toJson(summary),
        summary: toJson(summary),
        safetyFindings: toJson({
          criticalFailures: summary.criticalFailures,
          acceptableAsBaseline: summary.acceptableAsBaseline,
        }),
        totalCost: new Prisma.Decimal(summary.totalCostKobo),
        totalTokens: summary.totalTokens,
      },
    });

    return getAiEvaluationRunDetail({ businessId, runId: run.id });
  } catch (error) {
    const failedSummary = summarizeEvaluationRun({
      results: [],
      datasetVersion: suite.datasetVersion,
      model: selectedModel,
      promptVersion: selectedPromptVersion,
      toolVersion: aiEvaluationToolVersion,
      status: "failed",
    });
    await getPrisma().aiEvaluationRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        metrics: toJson(failedSummary),
        summary: toJson({
          ...failedSummary,
          failureReason: error instanceof Error ? error.message : "Evaluation run failed.",
        }),
      },
    });
    throw error;
  }
}

export async function listAiEvaluationRuns({
  businessId,
  limit = 50,
}: {
  businessId: string;
  limit?: number;
}) {
  const runs = await getPrisma().aiEvaluationRun.findMany({
    where: { businessId, suiteId: { not: null } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      suite: { select: { id: true, name: true, targetFeature: true } },
      acceptedBaselines: { select: { id: true } },
    },
  });

  return runs.map(serializeRunListItem);
}

export async function getAiEvaluationRunDetail({
  businessId,
  runId,
}: {
  businessId: string;
  runId: string;
}) {
  const run = await getPrisma().aiEvaluationRun.findFirst({
    where: { id: runId, businessId },
    include: {
      suite: { select: { id: true, name: true, targetFeature: true, datasetVersion: true } },
      results: {
        orderBy: { createdAt: "asc" },
        include: { case: true },
      },
      acceptedBaselines: true,
    },
  });

  if (!run) {
    throw new AiEvaluationDomainError("AI evaluation run was not found.", 404, "run_not_found");
  }

  return serializeRunDetail(run);
}

export async function cancelAiEvaluationRun({
  businessId,
  runId,
}: {
  businessId: string;
  runId: string;
}) {
  const run = await getPrisma().aiEvaluationRun.findFirst({
    where: { id: runId, businessId },
    include: { suite: true },
  });

  if (!run) {
    throw new AiEvaluationDomainError("AI evaluation run was not found.", 404, "run_not_found");
  }

  const summary = {
    ...(readSummary(run.summary) ?? {}),
    status: "cancelled",
    acceptableAsBaseline: false,
  };
  await getPrisma().aiEvaluationRun.update({
    where: { id: run.id },
    data: {
      status: run.status === "completed" ? "completed" : "failed",
      cancelledAt: run.cancelledAt ?? new Date(),
      completedAt: run.completedAt ?? new Date(),
      summary: toJson(summary),
      metrics: toJson(summary),
    },
  });

  return getAiEvaluationRunDetail({ businessId, runId });
}

export async function acceptAiEvaluationBaseline({
  businessId,
  runId,
  acceptedByUserId,
  notes,
}: {
  businessId: string;
  runId: string;
  acceptedByUserId: string;
  notes?: string;
}) {
  const detail = await getAiEvaluationRunDetail({ businessId, runId });
  const summary = detail.summary;

  if (!summary || detail.status !== "completed" || detail.cancelledAt || !summary.acceptableAsBaseline) {
    throw new AiEvaluationDomainError(
      "This AI evaluation run cannot be accepted as a baseline.",
      409,
      "baseline_blocked",
    );
  }

  const baseline = await getPrisma().aiEvaluationBaseline.upsert({
    where: {
      businessId_targetFeature_model_promptVersion_datasetVersion: {
        businessId,
        targetFeature: detail.suite?.targetFeature ?? "all_ai_surfaces",
        model: detail.model,
        promptVersion: detail.promptVersion,
        datasetVersion: detail.datasetVersion,
      },
    },
    create: {
      businessId,
      targetFeature: detail.suite?.targetFeature ?? "all_ai_surfaces",
      model: detail.model,
      promptVersion: detail.promptVersion,
      datasetVersion: detail.datasetVersion,
      acceptedRunId: runId,
      acceptedByUserId,
      notes: notes?.trim() || undefined,
    },
    update: {
      acceptedRunId: runId,
      acceptedByUserId,
      acceptedAt: new Date(),
      notes: notes?.trim() || undefined,
    },
  });

  return {
    id: baseline.id,
    targetFeature: baseline.targetFeature,
    model: baseline.model,
    promptVersion: baseline.promptVersion,
    datasetVersion: baseline.datasetVersion,
    acceptedRunId: baseline.acceptedRunId,
    acceptedAt: baseline.acceptedAt.toISOString(),
    notes: baseline.notes ?? undefined,
  };
}

export async function compareAiEvaluationRunRecords({
  businessId,
  leftRunId,
  rightRunId,
}: {
  businessId: string;
  leftRunId: string;
  rightRunId: string;
}) {
  if (!leftRunId || !rightRunId) {
    throw new AiEvaluationDomainError("Choose two runs to compare.", 400, "compare_runs_required");
  }

  const [left, right] = await Promise.all([
    getAiEvaluationRunDetail({ businessId, runId: leftRunId }),
    getAiEvaluationRunDetail({ businessId, runId: rightRunId }),
  ]);

  if (!left.summary || !right.summary) {
    throw new AiEvaluationDomainError("Both runs need summaries before comparison.", 409, "summary_required");
  }

  return {
    leftRun: left,
    rightRun: right,
    comparison: compareEvaluationRuns({
      baseline: left.summary,
      candidate: right.summary,
    }),
  };
}

async function executeCaseBatch({
  runId,
  cases,
  provider,
}: {
  runId: string;
  cases: AiEvaluationCaseDefinition[];
  provider: AiEvaluationProvider;
}) {
  const results: AiEvaluationCaseResult[] = [];
  let totalCostKobo = 0;
  let totalTokens = 0;

  await runBounded(cases, 2, async (caseDefinition) => {
    if (totalCostKobo >= aiEvaluationAcceptanceThresholds.maxRunCostKobo) {
      throw new AiEvaluationDomainError("AI evaluation cost cap reached.", 429, "cost_cap_reached");
    }

    const output = await evaluateWithRetryAndTimeout(provider, caseDefinition);
    totalCostKobo += output.estimatedCostKobo;
    totalTokens += output.tokenUsage.totalTokens;

    if (
      totalCostKobo > aiEvaluationAcceptanceThresholds.maxRunCostKobo ||
      totalTokens > aiEvaluationAcceptanceThresholds.maxRunTokens
    ) {
      throw new AiEvaluationDomainError("AI evaluation run cap reached.", 429, "run_cap_reached");
    }

    const evaluatorResults = evaluateAiEvaluationCase(caseDefinition, output);
    const result = scoreEvaluationCase({
      caseKey: caseDefinition.key,
      response: redactAiEvaluationResponse(output.response),
      toolCalls: output.toolCalls,
      citations: output.citations,
      evaluatorResults,
      latencyMs: output.latencyMs,
      tokenUsage: output.tokenUsage,
      estimatedCostKobo: output.estimatedCostKobo,
    });

    await getPrisma().aiEvaluationResult.create({
      data: {
        runId,
        caseId: findCaseId(caseDefinition),
        status: result.status,
        response: result.response,
        toolCalls: toJson(result.toolCalls),
        citations: toJson(result.citations),
        scores: toJson({
          caseKey: result.caseKey,
          score: result.score,
          criticalFailure: result.criticalFailure,
          evaluatorResults: result.evaluatorResults,
        }),
        latencyMs: result.latencyMs,
        tokenUsage: toJson(result.tokenUsage),
        estimatedCost: new Prisma.Decimal(result.estimatedCostKobo),
        failureReason: result.failureReason,
      },
    });
    results.push(result);
  });

  return results.sort((left, right) => left.caseKey.localeCompare(right.caseKey));
}

async function evaluateWithRetryAndTimeout(
  provider: AiEvaluationProvider,
  caseDefinition: AiEvaluationCaseDefinition,
) {
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await withTimeout(provider.evaluateCase(caseDefinition), caseDefinition.scoringConfig.maxLatencyMs ?? 5_000);
    } catch (error) {
      const retryable = error instanceof TransientAiEvaluationProviderError;
      if (!retryable || attempt === maxAttempts) {
        throw error;
      }
    }
  }

  throw new AiEvaluationDomainError("AI evaluation provider failed.", 502, "provider_failed");
}

async function runBounded<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  });

  await Promise.all(workers);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new AiEvaluationDomainError("AI evaluation case timed out.", 504, "case_timeout"));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function findCaseId(caseDefinition: AiEvaluationCaseDefinition) {
  return caseDefinition.fixtureReference.split("#caseId:")[1] ?? caseDefinition.key;
}

function caseFromRecord(record: {
  id: string;
  key: string;
  category: string;
  prompt: string;
  fixtureReference: string;
  expectedToolNames: string[];
  forbiddenToolNames: string[];
  expectedFacts: unknown;
  expectedRefusal: boolean;
  scoringConfig: unknown;
}): AiEvaluationCaseDefinition {
  return {
    key: record.key,
    category: record.category as AiEvaluationCaseDefinition["category"],
    prompt: record.prompt,
    fixtureReference: `${record.fixtureReference}#caseId:${record.id}`,
    expectedToolNames: record.expectedToolNames,
    forbiddenToolNames: record.forbiddenToolNames,
    expectedFacts: isRecord(record.expectedFacts) ? record.expectedFacts : undefined,
    expectedRefusal: record.expectedRefusal,
    scoringConfig: isRecord(record.scoringConfig) ? record.scoringConfig : {},
  };
}

function serializeSuite(suite: {
  id: string;
  businessId: string | null;
  name: string;
  description: string | null;
  targetFeature: string;
  status: string;
  datasetVersion: string;
  createdAt: Date;
  updatedAt: Date;
  _count?: { cases?: number; runs?: number };
}) {
  return {
    id: suite.id,
    businessId: suite.businessId ?? undefined,
    name: suite.name,
    description: suite.description ?? undefined,
    targetFeature: suite.targetFeature,
    status: suite.status,
    datasetVersion: suite.datasetVersion,
    caseCount: suite._count?.cases ?? 0,
    runCount: suite._count?.runs ?? 0,
    createdAt: suite.createdAt.toISOString(),
    updatedAt: suite.updatedAt.toISOString(),
  };
}

function serializeCase(caseRecord: {
  id: string;
  key: string;
  category: string;
  prompt: string;
  fixtureReference: string;
  expectedToolNames: string[];
  forbiddenToolNames: string[];
  expectedRefusal: boolean;
  createdAt: Date;
}) {
  return {
    id: caseRecord.id,
    key: caseRecord.key,
    category: caseRecord.category,
    prompt: caseRecord.prompt,
    fixtureReference: caseRecord.fixtureReference,
    expectedToolNames: caseRecord.expectedToolNames,
    forbiddenToolNames: caseRecord.forbiddenToolNames,
    expectedRefusal: caseRecord.expectedRefusal,
    createdAt: caseRecord.createdAt.toISOString(),
  };
}

function serializeRunListItem(run: {
  id: string;
  status: string;
  modelVersion: string;
  model?: string | null;
  promptVersion: string;
  toolVersion?: string | null;
  datasetVersion?: string | null;
  summary?: unknown;
  totalCost?: Prisma.Decimal | number | string | null;
  totalTokens?: number;
  startedAt: Date;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  suite?: { id: string; name: string; targetFeature: string } | null;
  acceptedBaselines?: Array<{ id: string }>;
}) {
  return {
    id: run.id,
    status: displayRunStatus(run),
    model: run.model ?? run.modelVersion,
    promptVersion: run.promptVersion,
    toolVersion: run.toolVersion ?? aiEvaluationToolVersion,
    datasetVersion: run.datasetVersion ?? aiEvaluationDatasetVersion,
    summary: readSummary(run.summary),
    totalCostKobo: Number(run.totalCost ?? 0),
    totalTokens: run.totalTokens ?? 0,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString(),
    cancelledAt: run.cancelledAt?.toISOString(),
    suite: run.suite ?? null,
    baseline: Boolean(run.acceptedBaselines?.length),
  };
}

function serializeRunDetail(run: Parameters<typeof serializeRunListItem>[0] & {
  businessId?: string | null;
  suiteId?: string | null;
  evaluatorVersion: string;
  results?: Array<{
    id: string;
    status: string;
    response: string;
    toolCalls: unknown;
    citations: unknown;
    scores: unknown;
    latencyMs: number;
    tokenUsage: unknown;
    estimatedCost: Prisma.Decimal;
    failureReason: string | null;
    createdAt: Date;
    case: { id: string; key: string; category: string; prompt: string; fixtureReference: string };
  }>;
}) {
  const listItem = serializeRunListItem(run);
  return {
    ...listItem,
    businessId: run.businessId ?? undefined,
    suiteId: run.suiteId ?? undefined,
    evaluatorVersion: run.evaluatorVersion,
    results: (run.results ?? []).map((result) => {
      const scores = isRecord(result.scores) ? result.scores : {};
      const evaluatorResults = Array.isArray(scores.evaluatorResults) ? scores.evaluatorResults : [];
      return {
        id: result.id,
        caseId: result.case.id,
        caseKey: result.case.key,
        category: result.case.category,
        prompt: result.case.prompt,
        fixtureReference: result.case.fixtureReference,
        status: result.status,
        response: result.response,
        toolCalls: Array.isArray(result.toolCalls) ? result.toolCalls : [],
        citations: Array.isArray(result.citations) ? result.citations : [],
        evaluatorResults,
        score: typeof scores.score === "number" ? scores.score : 0,
        criticalFailure: Boolean(scores.criticalFailure),
        latencyMs: result.latencyMs,
        tokenUsage: isRecord(result.tokenUsage) ? result.tokenUsage : { totalTokens: 0 },
        estimatedCostKobo: Number(result.estimatedCost),
        failureReason: result.failureReason ?? undefined,
        createdAt: result.createdAt.toISOString(),
      };
    }),
  };
}

function displayRunStatus(run: { status: string; cancelledAt?: Date | null }) {
  if (run.cancelledAt) {
    return "cancelled";
  }

  return run.status;
}

function readSummary(value: unknown): AiEvaluationRunSummary | null {
  if (!isRecord(value) || typeof value.version !== "string") {
    return null;
  }

  return value as AiEvaluationRunSummary;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
