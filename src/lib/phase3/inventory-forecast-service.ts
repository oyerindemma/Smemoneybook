import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  calculateInventoryForecast,
  inventoryForecastFormulaVersion,
  type InventoryForecastOverride,
  type InventoryForecastSummary,
} from "@/lib/phase3/inventory-forecast";

export type InventoryForecastScope = {
  businessId: string;
  locationId?: string;
  itemId?: string;
  now?: Date;
  forecastHorizonDays?: number;
  defaultSupplierLeadTimeDays?: number;
  defaultSafetyStockDays?: number;
  overrides?: InventoryForecastOverride[];
};

export async function calculateInventoryForecastForBusiness({
  businessId,
  locationId,
  itemId,
  now = new Date(),
  forecastHorizonDays,
  defaultSupplierLeadTimeDays,
  defaultSafetyStockDays,
  overrides,
}: InventoryForecastScope): Promise<InventoryForecastSummary> {
  const periodStart = addDays(now, -420);

  const [business, items, movements] = await Promise.all([
    getPrisma().business.findUniqueOrThrow({
      where: { id: businessId },
      select: { id: true, createdAt: true },
    }),
    getPrisma().inventoryItem.findMany({
      where: {
        businessId,
        archivedAt: null,
        ...(itemId ? { id: itemId } : {}),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        quantityOnHandDecimal: true,
        lowStockLevelDecimal: true,
        costPrice: true,
        sellingPrice: true,
        locationBalances: {
          where: locationId ? { businessId, locationId } : { id: "__no_location_scope__" },
          select: {
            quantityOnHandDecimal: true,
            lowStockLevelDecimal: true,
          },
          take: 1,
        },
      },
    }),
    getPrisma().inventoryMovement.findMany({
      where: {
        businessId,
        ...(itemId ? { itemId } : {}),
        ...(locationId
          ? {
              OR: [
                { locationId },
                { sourceLocationId: locationId },
                { destinationLocationId: locationId },
              ],
            }
          : {}),
        createdAt: { gte: periodStart, lt: now },
      },
      select: {
        itemId: true,
        type: true,
        quantity: true,
        quantityDecimal: true,
        adjustmentType: true,
        locationId: true,
        sourceLocationId: true,
        destinationLocationId: true,
        createdAt: true,
      },
    }),
  ]);

  return calculateInventoryForecast({
    businessId,
    locationId,
    itemId,
    businessCreatedAt: business.createdAt,
    periodStart,
    recordedThrough: now,
    generatedAt: now,
    forecastHorizonDays,
    defaultSupplierLeadTimeDays,
    defaultSafetyStockDays,
    overrides,
    items: items.map((item) => {
      const locationBalance = item.locationBalances[0];

      return {
        id: item.id,
        name: item.name,
        currentQuantity: (locationBalance?.quantityOnHandDecimal ?? item.quantityOnHandDecimal).toNumber(),
        lowStockLevel: (locationBalance?.lowStockLevelDecimal ?? item.lowStockLevelDecimal).toNumber(),
        costPrice: item.costPrice.toNumber(),
        sellingPrice: item.sellingPrice.toNumber(),
      };
    }),
    movements: movements.map((movement) => ({
      itemId: movement.itemId,
      type: movement.type.toLowerCase(),
      quantity: movement.quantityDecimal.toNumber() || movement.quantity,
      adjustmentType: movement.adjustmentType?.toLowerCase(),
      createdAt: movement.createdAt,
      locationId: movement.locationId,
      sourceLocationId: movement.sourceLocationId,
      destinationLocationId: movement.destinationLocationId,
    })),
  });
}

export async function saveInventoryForecastSnapshots({
  forecast,
  itemId,
}: {
  forecast: InventoryForecastSummary;
  itemId?: string;
}) {
  const selectedForecasts = forecast.forecasts.filter((item) => (itemId ? item.itemId === itemId : true));

  if (selectedForecasts.length === 0) {
    throw new Error("Choose a valid inventory item forecast.");
  }

  const prisma = getPrisma();

  return prisma.$transaction(
    selectedForecasts.map((item) =>
      prisma.inventoryForecastSnapshot.create({
        data: {
          businessId: forecast.businessId,
          locationId: forecast.locationId,
          itemId: item.itemId,
          formulaVersion: inventoryForecastFormulaVersion,
          classification: item.classification,
          confidence: item.confidence,
          periodStart: new Date(forecast.periodStart),
          recordedThrough: new Date(forecast.recordedThrough),
          forecastHorizonDays: forecast.forecastHorizonDays,
          generatedAt: new Date(forecast.generatedAt),
          currentQuantity: item.currentQuantity,
          lowStockLevel: item.lowStockLevel,
          averageDailyDemand: item.averageDailyDemand,
          recentDailyDemand: item.recentDailyDemand,
          trendMultiplier: item.trendMultiplier,
          daysOfStockRemaining: item.daysOfStockRemaining,
          predictedStockoutAt: item.predictedStockoutAt ? new Date(item.predictedStockoutAt) : undefined,
          restockByDate: item.restockByDate ? new Date(item.restockByDate) : undefined,
          suggestedReorderQuantity: item.suggestedReorderQuantity,
          supplierLeadTimeDays: item.supplierLeadTimeDays,
          safetyStockQuantity: item.safetyStockQuantity,
          manualOverride: item.manualOverride ? toJson(item.manualOverride) : undefined,
          assumptions: toJson(item.assumptions),
          recommendation: toJson(item.recommendation),
          dataWarnings: toJson(item.dataWarnings),
          sourceMetrics: toJson(item.sourceMetrics),
          accuracyMetrics: toJson(item.accuracyMetrics),
        },
      }),
    ),
  );
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}
