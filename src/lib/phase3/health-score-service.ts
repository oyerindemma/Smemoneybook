import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  calculateBusinessHealthScore,
  healthScoreFormulaVersion,
  type BusinessHealthScore,
  type HealthScoreInput,
} from "@/lib/phase3/health-score";

export type HealthScoreScope = {
  businessId: string;
  locationId?: string;
  now?: Date;
};

export async function calculateBusinessHealthScoreForBusiness({
  businessId,
  locationId,
  now = new Date(),
}: HealthScoreScope): Promise<BusinessHealthScore> {
  const periodEnd = now;
  const periodStart = addDays(periodEnd, -30);
  const previousPeriodEnd = periodStart;
  const previousPeriodStart = addDays(previousPeriodEnd, -30);

  const [business, transactions, debts, accounts, inventoryItems] = await Promise.all([
    getPrisma().business.findUniqueOrThrow({
      where: { id: businessId },
      select: { id: true, createdAt: true },
    }),
    getPrisma().transaction.findMany({
      where: {
        businessId,
        ...(locationId ? { locationId } : {}),
        occurredAt: { gte: previousPeriodStart, lt: periodEnd },
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
        reversalTransaction: { select: { id: true } },
      },
    }),
    getPrisma().debt.findMany({
      where: { businessId, status: "OPEN" },
      select: {
        type: true,
        amount: true,
        paidAmount: true,
        status: true,
        dueAt: true,
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
            lowStockLevelDecimal: true,
            inventoryItem: { select: { costPrice: true } },
          },
        })
      : getPrisma().inventoryItem.findMany({
          where: { businessId, archivedAt: null },
          select: {
            quantityOnHandDecimal: true,
            lowStockLevelDecimal: true,
            costPrice: true,
          },
        }),
  ]);

  const input: HealthScoreInput = {
    businessId,
    locationId,
    businessCreatedAt: business.createdAt,
    periodStart,
    periodEnd,
    previousPeriodStart,
    previousPeriodEnd,
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
      reversed: Boolean(transaction.reversalTransaction),
    })),
    debts: debts.map((debt) => ({
      type: debt.type.toLowerCase(),
      amount: debt.amount.toNumber(),
      paidAmount: debt.paidAmount.toNumber(),
      status: debt.status.toLowerCase(),
      dueAt: debt.dueAt,
    })),
    accounts: accounts.map((account) => ({
      balance: account.balance.toNumber(),
    })),
    inventoryItems: inventoryItems.map((item) => {
      if ("inventoryItem" in item) {
        return {
          quantityOnHand: item.quantityOnHandDecimal.toNumber(),
          lowStockLevel: item.lowStockLevelDecimal.toNumber(),
          costPrice: item.inventoryItem.costPrice.toNumber(),
        };
      }

      return {
        quantityOnHand: item.quantityOnHandDecimal.toNumber(),
        lowStockLevel: item.lowStockLevelDecimal.toNumber(),
        costPrice: item.costPrice.toNumber(),
      };
    }),
  };

  return calculateBusinessHealthScore(input);
}

export async function saveBusinessHealthScoreSnapshot({
  score,
  recalculatedFromId,
}: {
  score: BusinessHealthScore;
  recalculatedFromId?: string;
}) {
  return getPrisma().businessHealthScoreSnapshot.create({
    data: {
      businessId: score.businessId,
      locationId: score.locationId,
      formulaVersion: healthScoreFormulaVersion,
      score: score.score,
      rating: score.rating,
      confidence: score.confidence,
      periodStart: new Date(score.periodStart),
      periodEnd: new Date(score.periodEnd),
      generatedAt: new Date(score.generatedAt),
      components: score.components as unknown as Prisma.InputJsonValue,
      recommendations: score.recommendations as unknown as Prisma.InputJsonValue,
      dataWarnings: score.dataWarnings as unknown as Prisma.InputJsonValue,
      sourceMetrics: score.sourceMetrics as unknown as Prisma.InputJsonValue,
      recalculatedFromId,
    },
  });
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}
