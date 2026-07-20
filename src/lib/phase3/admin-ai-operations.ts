import { getPrisma } from "@/lib/prisma";
import {
  calculateAiEvaluationSummary,
  type AiEvaluationSummary,
} from "@/lib/phase3/ai-evaluation";

export type AdminAiOperationsSummaryInput = {
  evaluationSummary: AiEvaluationSummary;
  anomalyConfirmed: number;
  anomalyIncorrect: number;
  forecastAccuracyPercentages: number[];
  whatsappSent: number;
  whatsappFailed: number;
  whatsappQueued: number;
  bankImportFailures: number;
  reconciliationBacklog: number;
  taxAssistantUsage: number;
  payrollFailures: number;
  cooperativeArrears: number;
  atRiskBusinesses: number;
  customerSuccessInterventions: number;
};

export type AdminAiOperationsOverview = ReturnType<typeof summarizeAdminAiOperations>;

export function summarizeAdminAiOperations(input: AdminAiOperationsSummaryInput) {
  const whatsappTotal = input.whatsappSent + input.whatsappFailed + input.whatsappQueued;
  const operationalRiskSignals = [
    input.evaluationSummary.toolFailureRate !== null && input.evaluationSummary.toolFailureRate > 5,
    input.evaluationSummary.categorizationAccuracy !== null && input.evaluationSummary.categorizationAccuracy < 80,
    input.anomalyIncorrect > input.anomalyConfirmed,
    input.bankImportFailures > 0,
    input.reconciliationBacklog > 25,
    input.payrollFailures > 0,
    input.cooperativeArrears > 0,
  ].filter(Boolean).length;

  return {
    generatedAt: input.evaluationSummary.generatedAt,
    aiRequestVolume: input.evaluationSummary.requestVolume,
    aiCostKobo: input.evaluationSummary.totalCostKobo,
    averageLatencyMs: input.evaluationSummary.averageLatencyMs,
    p95LatencyMs: input.evaluationSummary.p95LatencyMs,
    toolFailureRate: input.evaluationSummary.toolFailureRate,
    recommendationAcceptanceRate: input.evaluationSummary.recommendationAcceptanceRate,
    categorizationAccuracy: input.evaluationSummary.categorizationAccuracy,
    anomalyPrecision: rate(input.anomalyConfirmed, input.anomalyConfirmed + input.anomalyIncorrect),
    anomalyConfirmed: input.anomalyConfirmed,
    anomalyIncorrect: input.anomalyIncorrect,
    forecastAccuracyPercent: average(input.forecastAccuracyPercentages),
    whatsappMessageHealth: {
      sent: input.whatsappSent,
      failed: input.whatsappFailed,
      queued: input.whatsappQueued,
      failureRate: rate(input.whatsappFailed, whatsappTotal),
    },
    bankImportFailures: input.bankImportFailures,
    reconciliationBacklog: input.reconciliationBacklog,
    taxAssistantUsage: input.taxAssistantUsage,
    payrollFailures: input.payrollFailures,
    cooperativeArrears: input.cooperativeArrears,
    atRiskBusinesses: input.atRiskBusinesses,
    customerSuccessInterventions: input.customerSuccessInterventions,
    operationalRiskSignals,
    operationalStatus: operationalRiskSignals === 0 ? "Healthy" : operationalRiskSignals <= 2 ? "Watch" : "Needs attention",
  };
}

export async function getAdminAiOperationsOverview({
  since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
}: {
  since?: Date;
} = {}) {
  const prisma = getPrisma();
  const now = new Date();
  const [
    events,
    datasets,
    runs,
    confirmedAlerts,
    incorrectAlerts,
    cashflowAccuracy,
    whatsappJobGroups,
    bankImportFailures,
    reconciliationBacklog,
    taxAssistantUsage,
    payrollFailures,
    cooperativeArrears,
    atRiskBusinesses,
    customerSuccessInterventions,
  ] = await Promise.all([
    prisma.aiEvaluationEvent.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 2_000,
    }),
    prisma.aiEvaluationDataset.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.aiEvaluationRun.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.predictiveAlertFeedback.count({
      where: {
        response: "confirmed",
        createdAt: { gte: since },
      },
    }),
    prisma.predictiveAlertFeedback.count({
      where: {
        response: "incorrect",
        createdAt: { gte: since },
      },
    }),
    prisma.cashflowForecastSnapshot.findMany({
      where: {
        evaluatedAt: { gte: since },
        accuracyPercent: { not: null },
      },
      select: { accuracyPercent: true },
      take: 500,
    }),
    prisma.whatsAppAutomationJob.groupBy({
      by: ["status"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.bankStatementImport.count({
      where: {
        importedAt: { gte: since },
        status: { in: ["FAILED", "ERROR", "REJECTED"] },
      },
    }),
    prisma.bankStatementImportRow.count({
      where: {
        createdAt: { gte: since },
        status: "UNMATCHED",
      },
    }),
    prisma.taxAssistantSnapshot.count({ where: { createdAt: { gte: since } } }),
    prisma.payrollRun.count({
      where: {
        createdAt: { gte: since },
        OR: [
          { status: { in: ["FAILED", "ERROR", "REVERSED"] } },
          { reversedAt: { not: null } },
        ],
      },
    }),
    prisma.cooperativeLoan.count({
      where: {
        dueAt: { lt: now },
        status: { notIn: ["SETTLED", "PAID", "CLOSED", "CANCELLED"] },
      },
    }),
    prisma.businessHealthScoreSnapshot.count({
      where: {
        generatedAt: { gte: since },
        score: { lt: 45 },
      },
    }),
    prisma.auditLog.count({
      where: {
        createdAt: { gte: since },
        action: { startsWith: "customer_success." },
      },
    }),
  ]);
  const evaluationSummary = calculateAiEvaluationSummary({
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
  const statusCounts = new Map(whatsappJobGroups.map((group) => [group.status.toLowerCase(), group._count._all]));

  return summarizeAdminAiOperations({
    evaluationSummary,
    anomalyConfirmed: confirmedAlerts,
    anomalyIncorrect: incorrectAlerts,
    forecastAccuracyPercentages: cashflowAccuracy.flatMap((item) =>
      item.accuracyPercent ? [item.accuracyPercent.toNumber()] : [],
    ),
    whatsappSent: (statusCounts.get("sent") ?? 0) + (statusCounts.get("delivered") ?? 0),
    whatsappFailed: (statusCounts.get("failed") ?? 0) + (statusCounts.get("error") ?? 0),
    whatsappQueued: (statusCounts.get("queued") ?? 0) + (statusCounts.get("pending") ?? 0),
    bankImportFailures,
    reconciliationBacklog,
    taxAssistantUsage,
    payrollFailures,
    cooperativeArrears,
    atRiskBusinesses,
    customerSuccessInterventions,
  });
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

  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}
