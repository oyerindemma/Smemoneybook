import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  detectPredictiveAlerts,
  type PredictiveAlertCandidate,
  type PredictiveAlertStatus,
} from "@/lib/phase3/predictive-alerts";

export type PredictiveAlertRecord = {
  id: string;
  businessId: string;
  locationId?: string;
  alertKey: string;
  type: string;
  severity: string;
  status: PredictiveAlertStatus;
  confidence: number;
  impactAmount: number;
  title: string;
  explanation: string;
  recommendedAction?: string;
  sourcePeriodStart: string;
  sourcePeriodEnd: string;
  detectedAt: string;
  sourceMetrics: Prisma.JsonValue;
  dismissedAt?: string;
  confirmedAt?: string;
  markedIncorrectAt?: string;
  resolvedAt?: string;
  lastFeedbackAt?: string;
  feedbackCount?: number;
};

export async function scanPredictiveAlertsForBusiness({
  businessId,
  locationId,
  generatedAt = new Date(),
  periodDays,
}: {
  businessId: string;
  locationId?: string;
  generatedAt?: Date;
  periodDays?: number;
}) {
  const lookbackStart = new Date(generatedAt.getTime() - 120 * 24 * 60 * 60 * 1000);
  const prisma = getPrisma();
  const transactionWhere = {
    businessId,
    occurredAt: {
      gte: lookbackStart,
      lt: generatedAt,
    },
    ...(locationId ? { locationId } : {}),
  };
  const movementWhere = {
    businessId,
    createdAt: {
      gte: lookbackStart,
      lt: generatedAt,
    },
    ...(locationId
      ? {
          OR: [
            { locationId },
            { sourceLocationId: locationId },
            { destinationLocationId: locationId },
          ],
        }
      : {}),
  };
  const [
    transactions,
    debts,
    inventoryItems,
    inventoryMovements,
    customerReturns,
    cashflowForecasts,
    bankImports,
  ] = await Promise.all([
    prisma.transaction.findMany({
      where: transactionWhere,
      orderBy: { occurredAt: "desc" },
      take: 2_000,
      select: {
        id: true,
        accountId: true,
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
        invoiceItems: true,
        customer: { select: { name: true } },
        supplier: { select: { name: true } },
        inventoryItem: { select: { name: true } },
        reversalTransaction: { select: { id: true } },
        reversesTransactionId: true,
      },
    }),
    prisma.debt.findMany({
      where: {
        businessId,
        status: "OPEN",
        ...(locationId ? { sourceTransaction: { locationId } } : {}),
      },
      select: {
        type: true,
        amount: true,
        paidAmount: true,
        status: true,
        dueAt: true,
        createdAt: true,
        customerId: true,
        supplierId: true,
        customer: { select: { name: true } },
      },
    }),
    prisma.inventoryItem.findMany({
      where: { businessId, archivedAt: null },
      select: {
        id: true,
        name: true,
        quantityOnHand: true,
        lowStockLevel: true,
        costPrice: true,
        sellingPrice: true,
      },
      take: 2_000,
    }),
    prisma.inventoryMovement.findMany({
      where: movementWhere,
      orderBy: { createdAt: "desc" },
      take: 2_000,
      select: {
        id: true,
        itemId: true,
        type: true,
        quantity: true,
        quantityDecimal: true,
        adjustmentType: true,
        reason: true,
        createdAt: true,
        locationId: true,
        sourceLocationId: true,
        destinationLocationId: true,
        item: { select: { name: true } },
      },
    }),
    prisma.customerReturn.findMany({
      where: {
        businessId,
        createdAt: {
          gte: lookbackStart,
          lt: generatedAt,
        },
        ...(locationId ? { locationId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        refundAmount: true,
        reason: true,
        createdAt: true,
        locationId: true,
      },
    }),
    prisma.cashflowForecastSnapshot.findMany({
      where: {
        businessId,
        generatedAt: { gte: new Date(generatedAt.getTime() - 30 * 24 * 60 * 60 * 1000) },
        ...(locationId ? { locationId } : {}),
      },
      orderBy: { generatedAt: "desc" },
      take: 9,
      select: {
        id: true,
        horizonDays: true,
        confidence: true,
        forecastEndingCash: true,
        lowerBound: true,
        forecastStart: true,
        forecastEnd: true,
        generatedAt: true,
      },
    }),
    prisma.bankStatementImport.findMany({
      where: {
        businessId,
        importedAt: {
          gte: lookbackStart,
          lt: generatedAt,
        },
        ...(locationId ? { locationId } : {}),
      },
      orderBy: { importedAt: "desc" },
      take: 100,
      select: {
        id: true,
        status: true,
        rowCount: true,
        matchedCount: true,
        duplicateRowCount: true,
        importedAt: true,
      },
    }),
  ]);

  const candidates = detectPredictiveAlerts({
    businessId,
    locationId,
    generatedAt,
    periodDays,
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      accountId: transaction.accountId,
      type: transaction.type,
      amount: transaction.amount.toNumber(),
      profit: transaction.profit.toNumber(),
      costOfGoods: transaction.costOfGoods.toNumber(),
      description: transaction.description,
      category: transaction.category,
      paymentStatus: transaction.paymentStatus,
      occurredAt: transaction.occurredAt,
      locationId: transaction.locationId,
      customerId: transaction.customerId,
      customerName: transaction.customer?.name,
      supplierId: transaction.supplierId,
      supplierName: transaction.supplier?.name,
      inventoryItemId: transaction.inventoryItemId,
      productName: transaction.inventoryItem?.name,
      inventoryQuantity: transaction.inventoryQuantity,
      invoiceItems: transaction.invoiceItems,
      reversed: Boolean(transaction.reversalTransaction || transaction.reversesTransactionId),
    })),
    debts: debts.map((debt) => ({
      type: debt.type,
      amount: debt.amount.toNumber(),
      paidAmount: debt.paidAmount.toNumber(),
      status: debt.status,
      dueAt: debt.dueAt,
      createdAt: debt.createdAt,
      customerId: debt.customerId,
      customerName: debt.customer?.name,
      supplierId: debt.supplierId,
    })),
    inventoryItems: inventoryItems.map((item) => ({
      id: item.id,
      name: item.name,
      quantityOnHand: item.quantityOnHand,
      lowStockLevel: item.lowStockLevel,
      costPrice: item.costPrice.toNumber(),
      sellingPrice: item.sellingPrice.toNumber(),
    })),
    inventoryMovements: inventoryMovements.map((movement) => ({
      id: movement.id,
      itemId: movement.itemId,
      itemName: movement.item.name,
      type: movement.type,
      quantity: movement.quantityDecimal.gt(0) ? movement.quantityDecimal.toNumber() : movement.quantity,
      adjustmentType: movement.adjustmentType,
      reason: movement.reason,
      createdAt: movement.createdAt,
      locationId: movement.locationId,
      sourceLocationId: movement.sourceLocationId,
      destinationLocationId: movement.destinationLocationId,
    })),
    returns: customerReturns.map((item) => ({
      id: item.id,
      refundAmount: item.refundAmount.toNumber(),
      reason: item.reason,
      createdAt: item.createdAt,
      locationId: item.locationId,
    })),
    cashflowForecasts: cashflowForecasts.map((forecast) => ({
      id: forecast.id,
      horizonDays: forecast.horizonDays,
      confidence: forecast.confidence,
      forecastEndingCash: forecast.forecastEndingCash.toNumber(),
      lowerBound: forecast.lowerBound.toNumber(),
      forecastStart: forecast.forecastStart,
      forecastEnd: forecast.forecastEnd,
      generatedAt: forecast.generatedAt,
    })),
    bankImports,
  });

  const savedAlerts = await saveAlertCandidates({ businessId, locationId, candidates });
  return savedAlerts;
}

export async function listPredictiveAlerts({
  businessId,
  locationId,
  statuses,
  take = 50,
}: {
  businessId: string;
  locationId?: string;
  statuses?: PredictiveAlertStatus[];
  take?: number;
}) {
  const alerts = await getPrisma().predictiveAlert.findMany({
    where: {
      businessId,
      ...(locationId ? { locationId } : {}),
      ...(statuses?.length ? { status: { in: statuses } } : {}),
    },
    orderBy: { detectedAt: "desc" },
    take,
    include: {
      _count: {
        select: { feedback: true },
      },
    },
  });

  return alerts.map(mapAlertRecord);
}

export async function recordPredictiveAlertFeedback({
  businessId,
  actorId,
  alertId,
  response,
  note,
}: {
  businessId: string;
  actorId: string;
  alertId: string;
  response: Exclude<PredictiveAlertStatus, "active">;
  note?: string;
}) {
  const prisma = getPrisma();
  const alert = await prisma.predictiveAlert.findFirst({
    where: { id: alertId, businessId },
  });

  if (!alert) {
    throw new Error("Choose a valid alert.");
  }

  const now = new Date();
  const [, updated] = await prisma.$transaction([
    prisma.predictiveAlertFeedback.create({
      data: {
        alertId,
        businessId,
        actorId,
        response,
        note,
        metadata: {
          previousStatus: alert.status,
          alertType: alert.type,
          severity: alert.severity,
        } as Prisma.InputJsonObject,
      },
    }),
    prisma.predictiveAlert.update({
      where: { id: alertId },
      data: {
        status: response,
        dismissedAt: response === "dismissed" ? now : undefined,
        confirmedAt: response === "confirmed" ? now : undefined,
        markedIncorrectAt: response === "incorrect" ? now : undefined,
        resolvedAt: response === "resolved" ? now : undefined,
        lastFeedbackAt: now,
      },
      include: {
        _count: {
          select: { feedback: true },
        },
      },
    }),
  ]);

  return mapAlertRecord(updated);
}

async function saveAlertCandidates({
  businessId,
  locationId,
  candidates,
}: {
  businessId: string;
  locationId?: string;
  candidates: PredictiveAlertCandidate[];
}) {
  if (candidates.length === 0) {
    return listPredictiveAlerts({
      businessId,
      locationId,
      statuses: ["active", "confirmed"],
      take: 20,
    });
  }

  const prisma = getPrisma();
  const existing = await prisma.predictiveAlert.findMany({
    where: {
      businessId,
      alertKey: { in: candidates.map((candidate) => candidate.alertKey) },
    },
    select: {
      id: true,
      alertKey: true,
      status: true,
    },
  });
  const existingByKey = new Map(existing.map((alert) => [alert.alertKey, alert]));

  await prisma.$transaction(
    candidates.map((candidate) => {
      const existingAlert = existingByKey.get(candidate.alertKey);
      const data = candidateToData({ businessId, locationId, candidate });

      if (existingAlert) {
        return prisma.predictiveAlert.update({
          where: { id: existingAlert.id },
          data,
        });
      }

      return prisma.predictiveAlert.create({
        data: {
          ...data,
          alertKey: candidate.alertKey,
          businessId,
          locationId,
          status: "active",
        },
      });
    }),
  );

  return listPredictiveAlerts({
    businessId,
    locationId,
    statuses: ["active", "confirmed"],
    take: 20,
  });
}

function candidateToData({
  candidate,
}: {
  businessId: string;
  locationId?: string;
  candidate: PredictiveAlertCandidate;
}) {
  return {
    type: candidate.type,
    severity: candidate.severity,
    confidence: new Prisma.Decimal(candidate.confidence),
    impactAmount: new Prisma.Decimal(candidate.impactAmount),
    title: candidate.title,
    explanation: candidate.explanation,
    recommendedAction: candidate.recommendedAction,
    sourcePeriodStart: new Date(candidate.sourcePeriodStart),
    sourcePeriodEnd: new Date(candidate.sourcePeriodEnd),
    detectedAt: new Date(),
    sourceMetrics: toJson(candidate.sourceMetrics),
  };
}

function mapAlertRecord(alert: {
  id: string;
  businessId: string;
  locationId: string | null;
  alertKey: string;
  type: string;
  severity: string;
  status: string;
  confidence: Prisma.Decimal;
  impactAmount: Prisma.Decimal;
  title: string;
  explanation: string;
  recommendedAction: string | null;
  sourcePeriodStart: Date;
  sourcePeriodEnd: Date;
  detectedAt: Date;
  sourceMetrics: Prisma.JsonValue;
  dismissedAt: Date | null;
  confirmedAt: Date | null;
  markedIncorrectAt: Date | null;
  resolvedAt: Date | null;
  lastFeedbackAt: Date | null;
  _count?: { feedback: number };
}): PredictiveAlertRecord {
  return {
    id: alert.id,
    businessId: alert.businessId,
    locationId: alert.locationId ?? undefined,
    alertKey: alert.alertKey,
    type: alert.type,
    severity: alert.severity,
    status: alert.status as PredictiveAlertStatus,
    confidence: alert.confidence.toNumber(),
    impactAmount: alert.impactAmount.toNumber(),
    title: alert.title,
    explanation: alert.explanation,
    recommendedAction: alert.recommendedAction ?? undefined,
    sourcePeriodStart: alert.sourcePeriodStart.toISOString(),
    sourcePeriodEnd: alert.sourcePeriodEnd.toISOString(),
    detectedAt: alert.detectedAt.toISOString(),
    sourceMetrics: alert.sourceMetrics,
    dismissedAt: alert.dismissedAt?.toISOString(),
    confirmedAt: alert.confirmedAt?.toISOString(),
    markedIncorrectAt: alert.markedIncorrectAt?.toISOString(),
    resolvedAt: alert.resolvedAt?.toISOString(),
    lastFeedbackAt: alert.lastFeedbackAt?.toISOString(),
    feedbackCount: alert._count?.feedback,
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
