import { describe, expect, it } from "vitest";
import {
  calculateInventoryForecast,
  type InventoryForecastMovement,
} from "@/lib/phase3/inventory-forecast";

const now = new Date("2026-07-19T12:00:00.000Z");

describe("calculateInventoryForecast", () => {
  it("predicts likely stockouts and suggested reorder quantities from stock-out demand", () => {
    const forecast = calculateInventoryForecast({
      businessId: "biz_1",
      businessCreatedAt: daysAgo(90),
      periodStart: daysAgo(90),
      recordedThrough: now,
      generatedAt: now,
      forecastHorizonDays: 30,
      defaultSupplierLeadTimeDays: 7,
      defaultSafetyStockDays: 3,
      items: [
        { id: "item_bread", name: "Bread", currentQuantity: 10, lowStockLevel: 5, costPrice: 500, sellingPrice: 800 },
      ],
      movements: Array.from({ length: 45 }, (_, index) => demand("item_bread", daysAgo(index + 1), 2)),
    });

    const [bread] = forecast.forecasts;

    expect(forecast.formulaVersion).toBe("inventory-forecast-v1");
    expect(bread.classification).toBe("likely_stockout");
    expect(bread.daysOfStockRemaining).toBeCloseTo(6.25);
    expect(bread.suggestedReorderQuantity).toBeGreaterThan(0);
    expect(bread.recommendation.action).toBe("restock_soon");
    expect(bread.accuracyMetrics.available).toBe(true);
  });

  it("marks dead stock when an item has stock but no demand history", () => {
    const forecast = calculateInventoryForecast({
      businessId: "biz_1",
      businessCreatedAt: daysAgo(100),
      periodStart: daysAgo(100),
      recordedThrough: now,
      generatedAt: now,
      items: [
        { id: "item_old", name: "Old charger", currentQuantity: 30, lowStockLevel: 5 },
      ],
      movements: [],
    });

    const [oldCharger] = forecast.forecasts;

    expect(oldCharger.classification).toBe("dead_stock");
    expect(oldCharger.confidence).toBe("insufficient_data");
    expect(oldCharger.dataWarnings.join(" ")).toContain("Inventory forecasts are planning estimates");
  });

  it("uses manual lead-time and safety-stock overrides when supplied", () => {
    const forecast = calculateInventoryForecast({
      businessId: "biz_1",
      businessCreatedAt: daysAgo(90),
      periodStart: daysAgo(90),
      recordedThrough: now,
      generatedAt: now,
      forecastHorizonDays: 30,
      items: [
        { id: "item_rice", name: "Rice bag", currentQuantity: 80, lowStockLevel: 10 },
      ],
      overrides: [
        {
          itemId: "item_rice",
          supplierLeadTimeDays: 21,
          safetyStockQuantity: 40,
          minimumReorderQuantity: 100,
        },
      ],
      movements: Array.from({ length: 60 }, (_, index) => demand("item_rice", daysAgo(index + 1), 3)),
    });

    const [rice] = forecast.forecasts;

    expect(rice.supplierLeadTimeDays).toBe(21);
    expect(rice.safetyStockQuantity).toBe(40);
    expect(rice.manualOverride?.minimumReorderQuantity).toBe(100);
    expect(rice.suggestedReorderQuantity).toBeGreaterThanOrEqual(100);
  });
});

function demand(itemId: string, createdAt: Date, quantity: number): InventoryForecastMovement {
  return {
    itemId,
    type: "stock_out",
    adjustmentType: "stock_out",
    quantity,
    createdAt,
  };
}

function daysAgo(days: number) {
  return new Date(now.getTime() - days * 86_400_000);
}
