import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  calculateTaxAssistantSummary,
  type TaxAssistantSummary,
} from "@/lib/phase3/tax-assistant";

export type TaxAssistantScope = {
  businessId: string;
  locationId?: string;
  periodStart: Date;
  periodEnd: Date;
  now?: Date;
};

export async function calculateTaxAssistantForBusiness({
  businessId,
  locationId,
  periodStart,
  periodEnd,
  now = new Date(),
}: TaxAssistantScope): Promise<TaxAssistantSummary> {
  const [taxConfig, rates, transactions, documentTaxSnapshots, priorTaxRuns] = await Promise.all([
    getPrisma().taxConfig.findUnique({
      where: { businessId },
      select: {
        country: true,
        enabled: true,
        registrationNumber: true,
        inclusiveByDefault: true,
        disclaimer: true,
      },
    }),
    getPrisma().taxRate.findMany({
      where: { businessId, archivedAt: null, ...(locationId ? { OR: [{ locationId }, { locationId: null }] } : {}) },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: {
        label: true,
        rate: true,
        type: true,
        isDefault: true,
      },
    }),
    getPrisma().transaction.findMany({
      where: {
        businessId,
        ...(locationId ? { locationId } : {}),
        occurredAt: { gte: periodStart, lt: periodEnd },
      },
      select: {
        type: true,
        amount: true,
        paymentStatus: true,
        occurredAt: true,
        category: true,
        reversalTransaction: { select: { id: true } },
        taxSnapshots: { select: { id: true } },
      },
    }),
    getPrisma().documentTaxSnapshot.findMany({
      where: {
        businessId,
        createdAt: { gte: periodStart, lt: periodEnd },
      },
      select: {
        label: true,
        rate: true,
        taxableAmount: true,
        taxAmount: true,
        inclusive: true,
        createdAt: true,
      },
    }),
    getPrisma().taxRun.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        month: true,
        year: true,
        vatRate: true,
        salesTotal: true,
        vatTotal: true,
        createdAt: true,
      },
    }),
  ]);

  return calculateTaxAssistantSummary({
    businessId,
    locationId,
    periodStart,
    periodEnd,
    generatedAt: now,
    taxConfig,
    rates: rates.map((rate) => ({
      label: rate.label,
      rate: rate.rate.toNumber(),
      type: rate.type.toLowerCase(),
      isDefault: rate.isDefault,
    })),
    transactions: transactions.map((transaction) => ({
      type: transaction.type.toLowerCase(),
      amount: transaction.amount.toNumber(),
      paymentStatus: transaction.paymentStatus.toLowerCase(),
      occurredAt: transaction.occurredAt,
      category: transaction.category,
      reversed: Boolean(transaction.reversalTransaction),
      hasTaxSnapshot: transaction.taxSnapshots.length > 0,
    })),
    documentTaxSnapshots: documentTaxSnapshots.map((snapshot) => ({
      label: snapshot.label,
      rate: snapshot.rate.toNumber(),
      taxableAmount: snapshot.taxableAmount.toNumber(),
      taxAmount: snapshot.taxAmount.toNumber(),
      inclusive: snapshot.inclusive,
      createdAt: snapshot.createdAt,
    })),
    priorTaxRuns: priorTaxRuns.map((run) => ({
      month: run.month,
      year: run.year,
      vatRate: run.vatRate.toNumber(),
      salesTotal: run.salesTotal.toNumber(),
      vatTotal: run.vatTotal.toNumber(),
      createdAt: run.createdAt,
    })),
  });
}

export async function saveTaxAssistantSnapshot({
  summary,
  recalculatedFromId,
}: {
  summary: TaxAssistantSummary;
  recalculatedFromId?: string;
}) {
  return getPrisma().taxAssistantSnapshot.create({
    data: {
      businessId: summary.businessId,
      locationId: summary.locationId,
      country: summary.country,
      ruleVersion: summary.ruleVersion,
      confidence: summary.confidence,
      periodStart: new Date(summary.periodStart),
      periodEnd: new Date(summary.periodEnd),
      generatedAt: new Date(summary.generatedAt),
      taxableSales: summary.taxableSales,
      estimatedTax: summary.estimatedTax,
      configuredRates: toJson(summary.configuredRates),
      missingSettings: toJson(summary.missingSettings),
      inconsistencies: toJson(summary.inconsistencies),
      reminders: toJson(summary.reminders),
      exportSummary: toJson(summary.exportSummary),
      dataWarnings: toJson(summary.dataWarnings),
      sourceMetrics: toJson(summary.sourceMetrics),
      recalculatedFromId,
    },
  });
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
