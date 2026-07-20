import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  calculateExecutiveDashboard,
  type ExecutiveDashboardSummary,
} from "@/lib/phase3/executive-dashboard";

export async function calculateExecutiveDashboardForBusiness({
  businessId,
  locationId,
  periodStart,
  periodEnd,
  generatedAt = new Date(),
}: {
  businessId: string;
  locationId?: string;
  periodStart: Date;
  periodEnd: Date;
  generatedAt?: Date;
}): Promise<ExecutiveDashboardSummary> {
  const [accounts, transactions, debts, inventoryItems, locations] = await Promise.all([
    getPrisma().account.findMany({
      where: { businessId },
      select: { balance: true },
    }),
    getPrisma().transaction.findMany({
      where: {
        businessId,
        ...(locationId ? { locationId } : {}),
        occurredAt: {
          gte: periodStart,
          lt: periodEnd,
        },
      },
      include: {
        inventoryItem: {
          select: {
            name: true,
          },
        },
        reversalTransaction: {
          select: {
            id: true,
          },
        },
      },
    }),
    getPrisma().debt.findMany({
      where: {
        businessId,
        status: "OPEN",
      },
    }),
    getPrisma().inventoryItem.findMany({
      where: { businessId },
      select: {
        id: true,
        name: true,
        quantityOnHand: true,
        costPrice: true,
        sellingPrice: true,
      },
    }),
    getPrisma().businessLocation.findMany({
      where: {
        businessId,
        archivedAt: null,
      },
      select: {
        id: true,
        name: true,
      },
    }),
  ]);

  return calculateExecutiveDashboard({
    periodStart,
    periodEnd,
    generatedAt,
    accounts: accounts.map((account) => ({ balance: account.balance.toNumber() })),
    transactions: transactions
      .filter((transaction) => !transaction.reversalTransaction && !transaction.reversesTransactionId)
      .map((transaction) => ({
        type: transaction.type.toLowerCase(),
        amount: transaction.amount.toNumber(),
        profit: transaction.profit.toNumber(),
        costOfGoods: transaction.costOfGoods.toNumber(),
        occurredAt: transaction.occurredAt,
        locationId: transaction.locationId,
        inventoryItemId: transaction.inventoryItemId,
        productName: transaction.inventoryItem?.name,
      })),
    debts: debts.map((debt) => ({
      type: debt.type.toLowerCase(),
      amount: debt.amount.toNumber(),
      paidAmount: debt.paidAmount.toNumber(),
      status: debt.status.toLowerCase(),
      dueAt: debt.dueAt,
    })),
    inventoryItems: inventoryItems.map((item) => ({
      id: item.id,
      name: item.name,
      quantityOnHand: item.quantityOnHand,
      costPrice: item.costPrice.toNumber(),
      sellingPrice: item.sellingPrice.toNumber(),
    })),
    locations,
  });
}

export async function saveExecutiveDashboardSnapshot({
  businessId,
  locationId,
  dashboard,
}: {
  businessId: string;
  locationId?: string;
  dashboard: ExecutiveDashboardSummary;
}) {
  return getPrisma().executiveDashboardSnapshot.create({
    data: {
      businessId,
      locationId,
      formulaVersion: dashboard.formulaVersion,
      periodStart: new Date(dashboard.periodStart),
      periodEnd: new Date(dashboard.periodEnd),
      generatedAt: new Date(dashboard.generatedAt),
      summary: toJson(dashboard.summary),
      recommendedActions: toJson(dashboard.recommendedActions),
      sourceMetrics: toJson(dashboard.sourceMetrics),
      freshness: toJson(dashboard.freshness),
    },
  });
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
