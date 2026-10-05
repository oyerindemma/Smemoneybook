import { Prisma } from "@prisma/client";
import { getBillingPlanByDbPlan } from "@/lib/billing/plans";
import { getPrisma } from "@/lib/prisma";
import { detectPredictiveAlerts, legacySeverity } from "@/lib/predictive-alerts/detectors";
import {
  defaultPredictiveAlertRules,
  predictiveAlertsRuleVersion,
  type BusinessAlertPreferenceInput,
  type PredictiveAlertCandidate,
  type PredictiveAlertLifecycleStatus,
  type PredictiveAlertRecord,
  type PredictiveAlertSeverity,
} from "@/lib/predictive-alerts/definitions";

const lookbackDays = 120;
const defaultListStatuses: PredictiveAlertLifecycleStatus[] = ["active", "acknowledged"];

export type PredictiveAlertEvaluationResult = {
  alerts: PredictiveAlertRecord[];
  generatedCount: number;
  resolvedCount: number;
  dataQuality: {
    status: "complete" | "partial" | "insufficient_data";
    notes: string[];
  };
};

export async function evaluatePredictiveAlertsForBusiness({
  businessId,
  locationId,
  generatedAt = new Date(),
  periodDays = 30,
}: {
  businessId: string;
  locationId?: string;
  generatedAt?: Date;
  periodDays?: number;
}): Promise<PredictiveAlertEvaluationResult> {
  await ensureDefaultPredictiveAlertRules();
  const [signals, preferences] = await Promise.all([
    loadPredictiveAlertSignals({ businessId, locationId, generatedAt }),
    listBusinessAlertPreferences({ businessId }),
  ]);
  const candidates = detectPredictiveAlerts({
    businessId,
    locationId,
    generatedAt,
    periodDays,
    preferences,
    ...signals,
  });
  const savedCount = await savePredictiveAlertCandidates({ businessId, locationId, generatedAt, candidates });
  const resolvedCount = await resolveStalePredictiveAlerts({ businessId, locationId, generatedAt, candidates });
  const alerts = await listPredictiveAlerts({
    businessId,
    locationId,
    statuses: defaultListStatuses,
    periodDays,
    take: 50,
  });

  return {
    alerts,
    generatedCount: savedCount,
    resolvedCount,
    dataQuality: summarizeAlertDataQuality(signals, candidates),
  };
}

export async function listPredictiveAlerts({
  businessId,
  locationId,
  statuses = defaultListStatuses,
  severity,
  category,
  periodDays,
  take = 50,
}: {
  businessId: string;
  locationId?: string;
  statuses?: PredictiveAlertLifecycleStatus[];
  severity?: PredictiveAlertSeverity;
  category?: string;
  periodDays?: number;
  take?: number;
}) {
  const detectedSince = periodDays
    ? new Date(Date.now() - Math.max(1, periodDays) * 24 * 60 * 60 * 1000)
    : null;
  const alerts = await getPrisma().predictiveAlert.findMany({
    where: {
      businessId,
      ...(locationId ? { locationId } : {}),
      ...(statuses.length ? { lifecycleStatus: { in: statuses } } : {}),
      ...(severity ? { severityLevel: severity } : {}),
      ...(category ? { category } : {}),
      ...(detectedSince
        ? {
            OR: [
              { lastDetectedAt: { gte: detectedSince } },
              { detectedAt: { gte: detectedSince } },
            ],
          }
        : {}),
    },
    orderBy: [{ lifecycleStatus: "asc" }, { lastDetectedAt: "desc" }, { detectedAt: "desc" }],
    take,
    include: {
      deliveries: {
        orderBy: { attemptedAt: "desc" },
        take: 3,
      },
    },
  });

  return alerts.map(mapPredictiveAlertRecord);
}

export async function getPredictiveAlert({
  businessId,
  alertId,
}: {
  businessId: string;
  alertId: string;
}) {
  const alert = await getPrisma().predictiveAlert.findFirst({
    where: { id: alertId, businessId },
    include: {
      deliveries: {
        orderBy: { attemptedAt: "desc" },
        take: 10,
      },
    },
  });

  return alert ? mapPredictiveAlertRecord(alert) : null;
}

export async function updatePredictiveAlertLifecycle({
  businessId,
  actorId,
  alertId,
  action,
  reason,
}: {
  businessId: string;
  actorId: string;
  alertId: string;
  action: "acknowledge" | "dismiss" | "reopen";
  reason?: string;
}) {
  const prisma = getPrisma();
  const alert = await prisma.predictiveAlert.findFirst({
    where: { id: alertId, businessId },
  });

  if (!alert) {
    throw new Error("Choose a valid Predictive Alert.");
  }

  const now = new Date();
  const nextData = lifecycleUpdateData({ action, actorId, reason, now });
  const feedbackResponse = action === "acknowledge" ? "confirmed" : action === "dismiss" ? "dismissed" : null;
  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.predictiveAlert.update({
      where: { id: alertId },
      data: nextData,
    }),
  ];

  if (feedbackResponse) {
    operations.push(
      prisma.predictiveAlertFeedback.create({
        data: {
          alertId,
          businessId,
          actorId,
          response: feedbackResponse,
          note: reason,
          metadata: {
            previousLifecycleStatus: alert.lifecycleStatus,
            action,
            ruleKey: alert.ruleKey ?? alert.type,
            severity: alert.severityLevel ?? alert.severity,
          } as Prisma.InputJsonObject,
        },
      }),
    );
  }

  await prisma.$transaction(operations);

  const updated = await getPredictiveAlert({ businessId, alertId });

  if (!updated) {
    throw new Error("Could not load updated Predictive Alert.");
  }

  return updated;
}

export async function listBusinessAlertPreferences({ businessId }: { businessId: string }) {
  await ensureDefaultPredictiveAlertRules();
  const preferences = await getPrisma().businessAlertPreference.findMany({
    where: { businessId },
    orderBy: { ruleKey: "asc" },
  });
  const byRule = new Map(preferences.map((preference) => [preference.ruleKey, preference]));

  return defaultPredictiveAlertRules.map((rule): BusinessAlertPreferenceInput & {
    category: string;
    severity: string;
    description: string;
    formulaReference: string;
    emailDeliveryAvailable: boolean;
    whatsappDeliveryAvailable: boolean;
  } => {
    const preference = byRule.get(rule.key);
    return {
      ruleKey: rule.key,
      enabled: preference?.enabled ?? true,
      severityOverride: normalizeSeverity(preference?.severityOverride),
      thresholdOverride: asMetricValues(preference?.thresholdOverride),
      inAppEnabled: preference?.inAppEnabled ?? true,
      emailEnabled: false,
      whatsappEnabled: false,
      category: rule.category,
      severity: rule.defaultSeverity,
      description: rule.description,
      formulaReference: rule.formulaReference,
      emailDeliveryAvailable: false,
      whatsappDeliveryAvailable: false,
    };
  });
}

export async function updateBusinessAlertPreferences({
  businessId,
  preferences,
}: {
  businessId: string;
  preferences: BusinessAlertPreferenceInput[];
}) {
  await ensureDefaultPredictiveAlertRules();
  const allowedRuleKeys = new Set(defaultPredictiveAlertRules.map((rule) => rule.key));
  const prisma = getPrisma();

  for (const preference of preferences) {
    if (!allowedRuleKeys.has(preference.ruleKey)) {
      continue;
    }

    await prisma.businessAlertPreference.upsert({
      where: {
        businessId_ruleKey: {
          businessId,
          ruleKey: preference.ruleKey,
        },
      },
      create: {
        businessId,
        ruleKey: preference.ruleKey,
        enabled: preference.enabled ?? true,
        severityOverride: preference.severityOverride ?? null,
        thresholdOverride: toJson(preference.thresholdOverride ?? null),
        inAppEnabled: preference.inAppEnabled ?? true,
        emailEnabled: false,
        whatsappEnabled: false,
      },
      update: {
        enabled: preference.enabled ?? true,
        severityOverride: preference.severityOverride ?? null,
        thresholdOverride: toJson(preference.thresholdOverride ?? null),
        inAppEnabled: preference.inAppEnabled ?? true,
        emailEnabled: false,
        whatsappEnabled: false,
      },
    });
  }

  return listBusinessAlertPreferences({ businessId });
}

async function loadPredictiveAlertSignals({
  businessId,
  locationId,
  generatedAt,
}: {
  businessId: string;
  locationId?: string;
  generatedAt: Date;
}) {
  const prisma = getPrisma();
  const lookbackStart = new Date(generatedAt.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const currentStart = new Date(generatedAt.getTime() - 30 * 24 * 60 * 60 * 1000);
  const transactionWhere: Prisma.TransactionWhereInput = {
    businessId,
    occurredAt: { gte: lookbackStart, lt: generatedAt },
    type: { in: ["SALE", "EXPENSE"] },
    ...(locationId ? { locationId } : {}),
  };
  const [
    business,
    activeSubscription,
    transactions,
    debts,
    inventoryItems,
    bankRows,
    bankImportCount,
    taxReviewItems,
    auditLogs,
  ] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: {
        id: true,
        onboardingCompleted: true,
        taxProfiles: { select: { id: true }, take: 1 },
      },
    }),
    prisma.subscription.findFirst({
      where: {
        businessId,
        status: "ACTIVE",
        OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: generatedAt } }],
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.transaction.findMany({
      where: transactionWhere,
      orderBy: { occurredAt: "desc" },
      take: 5_000,
      select: {
        id: true,
        type: true,
        amount: true,
        profit: true,
        costOfGoods: true,
        description: true,
        category: true,
        paymentStatus: true,
        occurredAt: true,
        locationId: true,
        customerId: true,
        supplierId: true,
        inventoryItemId: true,
        inventoryQuantity: true,
        customer: { select: { name: true } },
        supplier: { select: { name: true } },
        inventoryItem: { select: { name: true } },
        reversesTransactionId: true,
        reversalTransaction: { select: { id: true } },
      },
    }),
    prisma.debt.findMany({
      where: {
        businessId,
        status: "OPEN",
        ...(locationId ? { sourceTransaction: { locationId } } : {}),
      },
      take: 3_000,
      select: {
        id: true,
        type: true,
        amount: true,
        paidAmount: true,
        status: true,
        dueAt: true,
        createdAt: true,
        customerId: true,
        supplierId: true,
        customer: { select: { name: true } },
        supplier: { select: { name: true } },
      },
    }),
    prisma.inventoryItem.findMany({
      where: {
        businessId,
        archivedAt: null,
        ...(locationId ? { locationBalances: { some: { locationId } } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 3_000,
      select: {
        id: true,
        name: true,
        quantityOnHandDecimal: true,
        lowStockLevelDecimal: true,
        quantityOnHand: true,
        lowStockLevel: true,
        costPrice: true,
        sellingPrice: true,
        locationBalances: {
          ...(locationId ? { where: { locationId } } : {}),
          take: 1,
          select: {
            quantityOnHandDecimal: true,
            lowStockLevelDecimal: true,
          },
        },
      },
    }),
    prisma.bankStatementImportRow.findMany({
      where: {
        businessId,
        postedAt: { gte: lookbackStart, lt: generatedAt },
        ...(locationId ? { statementImport: { locationId } } : {}),
      },
      orderBy: { postedAt: "desc" },
      take: 5_000,
      select: {
        id: true,
        amount: true,
        status: true,
        duplicateStatus: true,
        postedAt: true,
        statementImport: { select: { importedAt: true } },
      },
    }),
    prisma.bankStatementImport.count({
      where: {
        businessId,
        ...(locationId ? { locationId } : {}),
      },
    }),
    prisma.taxReviewItem.findMany({
      where: {
        businessId,
        createdAt: { gte: lookbackStart, lt: generatedAt },
      },
      orderBy: { createdAt: "desc" },
      take: 1_000,
      select: {
        id: true,
        issueType: true,
        severity: true,
        status: true,
        explanation: true,
        createdAt: true,
      },
    }),
    prisma.auditLog.findMany({
      where: {
        businessId,
        createdAt: { gte: currentStart, lt: generatedAt },
        action: { in: ["transaction.sale", "transaction.expense", "pos.sale"] },
      },
      orderBy: { createdAt: "desc" },
      take: 5_000,
      select: {
        actorId: true,
        action: true,
        metadata: true,
        createdAt: true,
      },
    }),
  ]);
  const plan = activeSubscription ? getBillingPlanByDbPlan(activeSubscription.plan) : null;
  const staffAttribution = summarizeStaffAttribution({
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type.toString(),
      amount: transaction.amount.toNumber(),
      occurredAt: transaction.occurredAt,
    })),
    auditLogs,
    periodStart: currentStart,
    periodEnd: generatedAt,
  });

  return {
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type.toString(),
      amount: transaction.amount.toNumber(),
      profit: transaction.profit.toNumber(),
      costOfGoods: transaction.costOfGoods.toNumber(),
      description: transaction.description,
      category: transaction.category,
      paymentStatus: transaction.paymentStatus.toString(),
      occurredAt: transaction.occurredAt,
      locationId: transaction.locationId,
      customerId: transaction.customerId,
      customerName: transaction.customer?.name,
      supplierId: transaction.supplierId,
      supplierName: transaction.supplier?.name,
      inventoryItemId: transaction.inventoryItemId,
      inventoryItemName: transaction.inventoryItem?.name,
      inventoryQuantity: transaction.inventoryQuantity,
      reversed: Boolean(transaction.reversesTransactionId || transaction.reversalTransaction),
    })),
    debts: debts.map((debt) => ({
      id: debt.id,
      type: debt.type.toString(),
      amount: debt.amount.toNumber(),
      paidAmount: debt.paidAmount.toNumber(),
      status: debt.status.toString(),
      dueAt: debt.dueAt,
      createdAt: debt.createdAt,
      customerId: debt.customerId,
      customerName: debt.customer?.name,
      supplierId: debt.supplierId,
      supplierName: debt.supplier?.name,
    })),
    inventoryItems: inventoryItems.map((item) => {
      const balance = item.locationBalances[0];
      return {
        id: item.id,
        name: item.name,
        quantityOnHand: (balance?.quantityOnHandDecimal ?? item.quantityOnHandDecimal).toNumber(),
        lowStockLevel: (balance?.lowStockLevelDecimal ?? item.lowStockLevelDecimal).toNumber(),
        costPrice: item.costPrice.toNumber(),
        sellingPrice: item.sellingPrice.toNumber(),
      };
    }),
    bankRows: bankRows.map((row) => ({
      id: row.id,
      amount: row.amount.toNumber(),
      status: row.status,
      duplicateStatus: row.duplicateStatus,
      postedAt: row.postedAt,
      importedAt: row.statementImport.importedAt,
    })),
    taxReviewItems,
    staffAttribution,
    setup: {
      onboardingCompleted: business.onboardingCompleted,
      planId: plan?.id ?? "free",
      hasPredictiveAlertsEntitlement: Boolean(plan?.features.includes("predictive_alerts")),
      taxProfileConfigured: business.taxProfiles.length > 0,
      bankImportCount,
    },
  };
}

function summarizeStaffAttribution({
  transactions,
  auditLogs,
  periodStart,
  periodEnd,
}: {
  transactions: Array<{ id: string; type: string; amount: number; occurredAt: Date }>;
  auditLogs: Array<{ actorId: string | null; action: string; metadata: Prisma.JsonValue; createdAt: Date }>;
  periodStart: Date;
  periodEnd: Date;
}) {
  const currentTransactions = transactions.filter((transaction) => transaction.occurredAt >= periodStart && transaction.occurredAt < periodEnd);
  const transactionById = new Map(currentTransactions.map((transaction) => [transaction.id, transaction]));
  const attributedTransactionIds = new Set<string>();
  let attributedSalesAmount = 0;

  for (const log of auditLogs) {
    const metadata = asRecord(log.metadata);
    const transactionId = typeof metadata.transactionId === "string" ? metadata.transactionId : "";
    const transaction = transactionById.get(transactionId);

    if (!transaction || !log.actorId) {
      continue;
    }

    attributedTransactionIds.add(transaction.id);

    if (transaction.type.toLowerCase() === "sale") {
      attributedSalesAmount += transaction.amount;
    }
  }

  const totalSalesAmount = currentTransactions
    .filter((transaction) => transaction.type.toLowerCase() === "sale")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  return {
    totalActivityCount: currentTransactions.length,
    attributedActivityCount: attributedTransactionIds.size,
    unattributedActivityCount: Math.max(0, currentTransactions.length - attributedTransactionIds.size),
    totalSalesAmount,
    attributedSalesAmount,
    dataQualityNotes: currentTransactions.length === attributedTransactionIds.size
      ? []
      : ["Some sale or expense activity has no reliable staff audit attribution."],
  };
}

async function savePredictiveAlertCandidates({
  businessId,
  locationId,
  generatedAt,
  candidates,
}: {
  businessId: string;
  locationId?: string;
  generatedAt: Date;
  candidates: PredictiveAlertCandidate[];
}) {
  const prisma = getPrisma();
  let changedCount = 0;

  for (const candidate of candidates) {
    const existing = await prisma.predictiveAlert.findUnique({
      where: {
        businessId_alertKey: {
          businessId,
          alertKey: candidate.dedupeKey,
        },
      },
      select: {
        id: true,
        lifecycleStatus: true,
        firstDetectedAt: true,
      },
    });
    const data = candidateToAlertData({
      candidate,
      businessId,
      locationId,
      generatedAt,
      firstDetectedAt: existing?.firstDetectedAt ?? generatedAt,
      lifecycleStatus: existing?.lifecycleStatus === "dismissed"
        ? "dismissed"
        : existing?.lifecycleStatus === "acknowledged"
          ? "acknowledged"
          : "active",
    });
    const alert = existing
      ? await prisma.predictiveAlert.update({
          where: { id: existing.id },
          data,
          select: { id: true, deliveryCount: true },
        })
      : await prisma.predictiveAlert.create({
          data: {
            ...data,
            alertKey: candidate.dedupeKey,
            businessId,
            locationId,
          },
          select: { id: true, deliveryCount: true },
        });

    if (!existing && candidate.delivery.inApp) {
      await prisma.predictiveAlertDelivery.create({
        data: {
          businessId,
          alertId: alert.id,
          channel: "in_app",
          status: "delivered",
          attemptedAt: generatedAt,
          deliveredAt: generatedAt,
        },
      });
      await prisma.predictiveAlert.update({
        where: { id: alert.id },
        data: { deliveryCount: alert.deliveryCount + 1 },
      });
    }

    changedCount += 1;
  }

  return changedCount;
}

async function resolveStalePredictiveAlerts({
  businessId,
  locationId,
  generatedAt,
  candidates,
}: {
  businessId: string;
  locationId?: string;
  generatedAt: Date;
  candidates: PredictiveAlertCandidate[];
}) {
  const activeDedupeKeys = new Set(candidates.map((candidate) => candidate.dedupeKey));
  const result = await getPrisma().predictiveAlert.updateMany({
    where: {
      businessId,
      ...(locationId ? { locationId } : {}),
      lifecycleStatus: { in: ["active", "acknowledged"] },
      ruleKey: { in: defaultPredictiveAlertRules.map((rule) => rule.key) },
      dedupeKey: { notIn: Array.from(activeDedupeKeys) },
    },
    data: {
      lifecycleStatus: "resolved",
      status: "resolved",
      resolvedAt: generatedAt,
      resolutionNote: "Resolved because the deterministic condition was not detected in the latest evaluation.",
      lastFeedbackAt: generatedAt,
    },
  });

  return result.count;
}

function candidateToAlertData({
  candidate,
  generatedAt,
  firstDetectedAt,
  lifecycleStatus,
}: {
  candidate: PredictiveAlertCandidate;
  businessId: string;
  locationId?: string;
  generatedAt: Date;
  firstDetectedAt: Date;
  lifecycleStatus: string;
}) {
  return {
    ruleKey: candidate.ruleKey,
    category: candidate.category,
    severityLevel: candidate.severity,
    type: candidate.ruleKey,
    severity: legacySeverity(candidate.severity),
    status: lifecycleStatus === "acknowledged" ? "confirmed" : lifecycleStatus,
    lifecycleStatus,
    confidence: new Prisma.Decimal(candidate.confidence),
    impactAmount: new Prisma.Decimal(candidate.impactAmount),
    title: candidate.title,
    explanation: candidate.explanation,
    recommendedAction: candidate.recommendedAction,
    evidence: toJson(candidate.evidence),
    formulaReference: candidate.formulaReference,
    dedupeKey: candidate.dedupeKey,
    periodStart: new Date(candidate.period.start),
    periodEnd: new Date(candidate.period.end),
    sourcePeriodStart: new Date(candidate.period.start),
    sourcePeriodEnd: new Date(candidate.period.end),
    detectedAt: generatedAt,
    firstDetectedAt,
    lastDetectedAt: generatedAt,
    sourceMetrics: toJson(candidate.sourceMetrics),
  };
}

function lifecycleUpdateData({
  action,
  actorId,
  reason,
  now,
}: {
  action: "acknowledge" | "dismiss" | "reopen";
  actorId: string;
  reason?: string;
  now: Date;
}): Prisma.PredictiveAlertUpdateInput {
  if (action === "acknowledge") {
    return {
      lifecycleStatus: "acknowledged",
      status: "confirmed",
      acknowledgedAt: now,
      acknowledgedByUserId: actorId,
      lastFeedbackAt: now,
    };
  }

  if (action === "dismiss") {
    return {
      lifecycleStatus: "dismissed",
      status: "dismissed",
      dismissedAt: now,
      dismissedReason: reason,
      lastFeedbackAt: now,
    };
  }

  return {
    lifecycleStatus: "active",
    status: "active",
    dismissedAt: null,
    dismissedReason: null,
    resolvedAt: null,
    resolutionNote: null,
    acknowledgedAt: null,
    acknowledgedByUserId: null,
    lastFeedbackAt: now,
  };
}

async function ensureDefaultPredictiveAlertRules() {
  const prisma = getPrisma();

  await prisma.$transaction(
    defaultPredictiveAlertRules.map((rule) =>
      prisma.predictiveAlertRule.upsert({
        where: { key: rule.key },
        create: {
          key: rule.key,
          category: rule.category,
          version: rule.version,
          severity: rule.defaultSeverity,
          thresholdConfig: toJson(rule.thresholdConfig),
          requiredHistoryDays: rule.requiredHistoryDays,
          enabled: rule.enabled,
          description: rule.description,
          formulaReference: rule.formulaReference,
        },
        update: {
          category: rule.category,
          version: rule.version,
          severity: rule.defaultSeverity,
          thresholdConfig: toJson(rule.thresholdConfig),
          requiredHistoryDays: rule.requiredHistoryDays,
          enabled: rule.enabled,
          description: rule.description,
          formulaReference: rule.formulaReference,
        },
      }),
    ),
  );
}

function summarizeAlertDataQuality(
  signals: Awaited<ReturnType<typeof loadPredictiveAlertSignals>>,
  candidates: PredictiveAlertCandidate[],
) {
  const notes = new Set<string>();

  if (signals.transactions.length < 4) {
    notes.add("Sales and expense trend alerts need at least a few recorded transactions in both periods.");
  }

  if (signals.bankRows.length === 0) {
    notes.add("Bank reconciliation alerts need imported bank statement rows.");
  }

  if (!signals.setup.taxProfileConfigured) {
    notes.add("Tax-readiness alerts improve after the business tax profile is configured.");
  }

  for (const candidate of candidates) {
    for (const note of candidate.missingData) {
      notes.add(note);
    }
  }

  const status: PredictiveAlertEvaluationResult["dataQuality"]["status"] =
    signals.transactions.length === 0 ? "insufficient_data" : notes.size ? "partial" : "complete";

  return {
    status,
    notes: Array.from(notes),
  };
}

function mapPredictiveAlertRecord(alert: {
  id: string;
  businessId: string;
  locationId: string | null;
  alertKey: string;
  ruleKey: string | null;
  category: string | null;
  severityLevel: string | null;
  type: string;
  severity: string;
  status: string;
  lifecycleStatus: string;
  confidence: Prisma.Decimal;
  impactAmount: Prisma.Decimal;
  title: string;
  explanation: string;
  recommendedAction: string | null;
  evidence: Prisma.JsonValue | null;
  formulaReference: string | null;
  dedupeKey: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  sourcePeriodStart: Date;
  sourcePeriodEnd: Date;
  firstDetectedAt: Date | null;
  lastDetectedAt: Date | null;
  detectedAt: Date;
  sourceMetrics: Prisma.JsonValue;
  dismissedAt: Date | null;
  dismissedReason: string | null;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  acknowledgedAt: Date | null;
  acknowledgedByUserId: string | null;
  deliveryCount: number;
  createdAt: Date;
  updatedAt: Date;
}): PredictiveAlertRecord {
  const rule = defaultPredictiveAlertRules.find((item) => item.key === (alert.ruleKey ?? alert.type));
  const periodStart = alert.periodStart ?? alert.sourcePeriodStart;
  const periodEnd = alert.periodEnd ?? alert.sourcePeriodEnd;
  const evidence = asRecord(alert.evidence);
  const sourceMetrics = asRecord(alert.sourceMetrics);

  return {
    id: alert.id,
    businessId: alert.businessId,
    locationId: alert.locationId ?? undefined,
    alertKey: alert.alertKey,
    ruleKey: alert.ruleKey ?? alert.type,
    category: (alert.category ?? rule?.category ?? alert.type) as PredictiveAlertRecord["category"],
    severity: normalizeSeverity(alert.severityLevel) ?? severityFromLegacy(alert.severity),
    title: alert.title,
    explanation: alert.explanation,
    recommendedAction: alert.recommendedAction ?? rule?.description ?? "Review the source data.",
    evidence: {
      whatChanged: stringValue(evidence.whatChanged) || alert.explanation,
      comparedPeriod: stringValue(evidence.comparedPeriod) || `${alert.sourcePeriodStart.toISOString()} to ${alert.sourcePeriodEnd.toISOString()}`,
      metricValues: asMetricValues(evidence.metricValues) ?? asMetricValues(sourceMetrics) ?? {},
      threshold: asMetricValues(evidence.threshold) ?? rule?.thresholdConfig ?? {},
      formula: stringValue(evidence.formula) || rule?.formula || alert.formulaReference || predictiveAlertsRuleVersion,
      sourceData: arrayOfStrings(evidence.sourceData) ?? rule?.sourceData ?? [],
      missingData: arrayOfStrings(evidence.missingData) ?? [],
      recommendedReviewAction: stringValue(evidence.recommendedReviewAction) || alert.recommendedAction || "Review the source data.",
      disclaimer: stringValue(evidence.disclaimer) || undefined,
    },
    period: {
      label: stringValue(sourceMetrics.periodLabel) || "current_period",
      start: periodStart.toISOString(),
      end: periodEnd.toISOString(),
    },
    impactAmount: alert.impactAmount.toNumber(),
    confidence: alert.confidence.toNumber(),
    formulaReference: alert.formulaReference ?? rule?.formulaReference ?? predictiveAlertsRuleVersion,
    dedupeKey: alert.dedupeKey ?? alert.alertKey,
    sourceMetrics: asMetricValues(sourceMetrics) ?? {},
    missingData: arrayOfStrings(evidence.missingData) ?? [],
    delivery: {
      inApp: true,
      email: false,
      whatsapp: false,
    },
    lifecycleStatus: normalizeLifecycle(alert.lifecycleStatus),
    legacyStatus: alert.status,
    legacySeverity: alert.severity as PredictiveAlertRecord["legacySeverity"],
    firstDetectedAt: (alert.firstDetectedAt ?? alert.detectedAt).toISOString(),
    lastDetectedAt: (alert.lastDetectedAt ?? alert.detectedAt).toISOString(),
    createdAt: alert.createdAt.toISOString(),
    updatedAt: alert.updatedAt.toISOString(),
    acknowledgedAt: alert.acknowledgedAt?.toISOString(),
    acknowledgedByUserId: alert.acknowledgedByUserId ?? undefined,
    dismissedAt: alert.dismissedAt?.toISOString(),
    dismissedReason: alert.dismissedReason ?? undefined,
    resolvedAt: alert.resolvedAt?.toISOString(),
    resolutionNote: alert.resolutionNote ?? undefined,
    deliveryCount: alert.deliveryCount,
  };
}

function normalizeLifecycle(value: string): PredictiveAlertLifecycleStatus {
  if (value === "acknowledged" || value === "resolved" || value === "dismissed") {
    return value;
  }

  return "active";
}

function normalizeSeverity(value?: string | null): PredictiveAlertSeverity | null {
  if (value === "critical" || value === "high" || value === "medium" || value === "low" || value === "information") {
    return value;
  }

  return null;
}

function severityFromLegacy(value: string): PredictiveAlertSeverity {
  if (value === "critical") {
    return "critical";
  }

  if (value === "warning") {
    return "medium";
  }

  return "information";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asMetricValues(value: unknown): Record<string, number | string | boolean | null> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(value).filter(([, item]) =>
      item === null || ["number", "string", "boolean"].includes(typeof item),
    ),
  ) as Record<string, number | string | boolean | null>;
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
