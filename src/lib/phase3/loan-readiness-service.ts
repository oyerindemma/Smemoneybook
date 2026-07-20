import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  calculateLoanReadiness,
  loanReadinessFormulaVersion,
  type LoanReadinessAssessment,
} from "@/lib/phase3/loan-readiness";

export type LoanReadinessScope = {
  businessId: string;
  locationId?: string;
  now?: Date;
};

export async function calculateLoanReadinessForBusiness({
  businessId,
  locationId,
  now = new Date(),
}: LoanReadinessScope): Promise<LoanReadinessAssessment> {
  const periodEnd = now;
  const periodStart = addDays(periodEnd, -180);

  const [business, transactions, debts, accounts, inventoryItems] = await Promise.all([
    getPrisma().business.findUniqueOrThrow({
      where: { id: businessId },
      select: { id: true, createdAt: true },
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
        profit: true,
        paymentStatus: true,
        occurredAt: true,
        category: true,
        customerId: true,
        supplierId: true,
        inventoryItemId: true,
        inventoryQuantity: true,
        reversalTransaction: { select: { id: true } },
      },
    }),
    getPrisma().debt.findMany({
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
      },
    }),
    getPrisma().account.findMany({
      where: { businessId },
      select: { balance: true },
    }),
    locationId
      ? getPrisma().inventoryBalance.findMany({
          where: { businessId, locationId },
          select: {
            quantityOnHandDecimal: true,
            inventoryItem: { select: { costPrice: true } },
          },
        })
      : getPrisma().inventoryItem.findMany({
          where: { businessId, archivedAt: null },
          select: {
            quantityOnHandDecimal: true,
            costPrice: true,
          },
        }),
  ]);

  return calculateLoanReadiness({
    businessId,
    locationId,
    businessCreatedAt: business.createdAt,
    periodStart,
    periodEnd,
    generatedAt: now,
    transactions: transactions.map((transaction) => ({
      type: transaction.type.toLowerCase(),
      amount: transaction.amount.toNumber(),
      profit: transaction.profit.toNumber(),
      paymentStatus: transaction.paymentStatus.toLowerCase(),
      occurredAt: transaction.occurredAt,
      category: transaction.category,
      customerId: transaction.customerId,
      supplierId: transaction.supplierId,
      inventoryItemId: transaction.inventoryItemId,
      inventoryQuantity: transaction.inventoryQuantity,
      reversed: Boolean(transaction.reversalTransaction),
    })),
    debts: debts.map((debt) => ({
      type: debt.type.toLowerCase(),
      amount: debt.amount.toNumber(),
      paidAmount: debt.paidAmount.toNumber(),
      status: debt.status.toLowerCase(),
      dueAt: debt.dueAt,
      createdAt: debt.createdAt,
    })),
    accounts: accounts.map((account) => ({ balance: account.balance.toNumber() })),
    inventoryItems: inventoryItems.map((item) => {
      if ("inventoryItem" in item) {
        return {
          quantityOnHand: item.quantityOnHandDecimal.toNumber(),
          costPrice: item.inventoryItem.costPrice.toNumber(),
        };
      }

      return {
        quantityOnHand: item.quantityOnHandDecimal.toNumber(),
        costPrice: item.costPrice.toNumber(),
      };
    }),
  });
}

export async function saveLoanReadinessSnapshot({
  assessment,
  recalculatedFromId,
}: {
  assessment: LoanReadinessAssessment;
  recalculatedFromId?: string;
}) {
  return getPrisma().loanReadinessSnapshot.create({
    data: {
      businessId: assessment.businessId,
      locationId: assessment.locationId,
      formulaVersion: loanReadinessFormulaVersion,
      score: assessment.score,
      rating: assessment.rating,
      confidence: assessment.confidence,
      periodStart: new Date(assessment.periodStart),
      periodEnd: new Date(assessment.periodEnd),
      generatedAt: new Date(assessment.generatedAt),
      components: toJson(assessment.components),
      strengths: toJson(assessment.strengths),
      weaknesses: toJson(assessment.weaknesses),
      recommendations: toJson(assessment.recommendations),
      dataCompleteness: toJson(assessment.dataCompleteness),
      dataWarnings: toJson(assessment.dataWarnings),
      sourceMetrics: toJson(assessment.sourceMetrics),
      recalculatedFromId,
    },
  });
}

export async function recordLoanReadinessSharingConsent({
  businessId,
  actorId,
  snapshotId,
  partnerName,
  purpose,
  consentText,
  metadata,
}: {
  businessId: string;
  actorId: string;
  snapshotId?: string;
  partnerName: string;
  purpose: string;
  consentText: string;
  metadata?: Record<string, unknown>;
}) {
  if (snapshotId) {
    const snapshot = await getPrisma().loanReadinessSnapshot.findFirst({
      where: { id: snapshotId, businessId },
      select: { id: true },
    });

    if (!snapshot) {
      throw new Error("Choose a valid loan readiness snapshot.");
    }
  }

  return getPrisma().loanReadinessSharingLog.create({
    data: {
      businessId,
      actorId,
      snapshotId,
      partnerName,
      purpose,
      consentText,
      metadata: metadata ? toJson(metadata) : undefined,
    },
  });
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}
