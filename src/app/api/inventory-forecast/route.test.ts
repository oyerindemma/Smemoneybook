import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const enforceRateLimit = vi.fn();
const requireBusinessAccess = vi.fn();
const requireLocationAccess = vi.fn();
const requireMinimumPlan = vi.fn();
const calculateForecast = vi.fn();
const saveSnapshots = vi.fn();
const createAudit = vi.fn();
const originalEnv = { ...process.env };

vi.mock("@/lib/auth/session", () => ({
  requireUser,
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  enforceRateLimit,
}));

vi.mock("@/lib/operations/access", () => ({
  requireBusinessAccess,
  requireLocationAccess,
}));

vi.mock("@/lib/billing/subscriptions", () => ({
  requireMinimumPlan,
}));

vi.mock("@/lib/phase3/inventory-forecast-service", () => ({
  calculateInventoryForecastForBusiness: calculateForecast,
  saveInventoryForecastSnapshots: saveSnapshots,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    auditLog: {
      create: createAudit,
    },
  }),
}));

const forecast = {
  businessId: "biz_1",
  formulaVersion: "inventory-forecast-v1",
  generatedAt: "2026-07-19T06:00:00.000Z",
  periodStart: "2025-05-25T06:00:00.000Z",
  recordedThrough: "2026-07-19T06:00:00.000Z",
  forecastHorizonDays: 30,
  forecasts: [
    {
      itemId: "item_1",
      itemName: "Rice bag",
      classification: "likely_stockout",
      confidence: "medium",
      currentQuantity: 8,
      lowStockLevel: 5,
      averageDailyDemand: 1,
      recentDailyDemand: 1.2,
      forecastDailyDemand: 1.1,
      trendMultiplier: 1.1,
      seasonalMultiplier: 1,
      daysOfStockRemaining: 7.3,
      predictedStockoutAt: "2026-07-27T06:00:00.000Z",
      restockByDate: "2026-07-20T06:00:00.000Z",
      suggestedReorderQuantity: 45,
      supplierLeadTimeDays: 7,
      safetyStockDays: 7,
      safetyStockQuantity: 8,
      assumptions: [],
      recommendation: { action: "restock_soon", message: "Restock soon.", suggestedQuantity: 45 },
      dataWarnings: [],
      sourceMetrics: {},
      accuracyMetrics: { available: true, accuracyPercent: 80 },
    },
  ],
  dataWarnings: [],
  sourceMetrics: {},
};

describe("/api/inventory-forecast", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PHASE3_INVENTORY_FORECASTING_ENABLED = "true";
    requireUser.mockResolvedValue({ id: "user_1" });
    enforceRateLimit.mockResolvedValue(null);
    requireBusinessAccess.mockResolvedValue({ businessId: "biz_1" });
    requireLocationAccess.mockResolvedValue({ businessId: "biz_1", locationId: "loc_1" });
    requireMinimumPlan.mockResolvedValue(null);
    calculateForecast.mockResolvedValue(forecast);
    saveSnapshots.mockResolvedValue([{ id: "inventory_snap_1", itemId: "item_1", classification: "likely_stockout" }]);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("requires the Phase 3 inventory forecast flag", async () => {
    process.env.NEXT_PUBLIC_PHASE3_INVENTORY_FORECASTING_ENABLED = "false";
    vi.resetModules();

    const { GET } = await import("@/app/api/inventory-forecast/route");
    const response = await GET(new Request("http://localhost/api/inventory-forecast?businessId=biz_1"));

    expect(response.status).toBe(404);
    expect(calculateForecast).not.toHaveBeenCalled();
  });

  it("calculates a gated inventory forecast with location access and overrides", async () => {
    const { GET } = await import("@/app/api/inventory-forecast/route");
    const response = await GET(
      new Request(
        "http://localhost/api/inventory-forecast?businessId=biz_1&locationId=loc_1&itemId=item_1&supplierLeadTimeDays=10&safetyStockDays=5",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.forecast.forecasts[0].itemId).toBe("item_1");
    expect(requireBusinessAccess).toHaveBeenCalledWith("user_1", "inventory:write", "biz_1");
    expect(requireLocationAccess).toHaveBeenCalledWith({
      userId: "user_1",
      businessId: "biz_1",
      locationId: "loc_1",
      permission: "inventory:write",
    });
    expect(requireMinimumPlan).toHaveBeenCalledWith(
      "user_1",
      "biz_1",
      "growth",
      "Upgrade to Growth to use Inventory Forecasting.",
    );
    expect(calculateForecast).toHaveBeenCalledWith({
      businessId: "biz_1",
      locationId: "loc_1",
      itemId: "item_1",
      forecastHorizonDays: undefined,
      defaultSupplierLeadTimeDays: 10,
      defaultSafetyStockDays: 5,
      overrides: [
        {
          itemId: "item_1",
          supplierLeadTimeDays: 10,
          safetyStockDays: 5,
          safetyStockQuantity: undefined,
          minimumReorderQuantity: undefined,
        },
      ],
    });
  });

  it("saves inventory forecast snapshots and audits the action", async () => {
    const { POST } = await import("@/app/api/inventory-forecast/route");
    const response = await POST(
      new Request("http://localhost/api/inventory-forecast", {
        method: "POST",
        body: JSON.stringify({
          businessId: "biz_1",
          itemId: "item_1",
          supplierLeadTimeDays: 10,
          minimumReorderQuantity: 20,
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.snapshotIds).toEqual(["inventory_snap_1"]);
    expect(saveSnapshots).toHaveBeenCalledWith({ forecast, itemId: "item_1" });
    expect(createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "inventory_forecast.snapshot_saved",
          businessId: "biz_1",
        }),
      }),
    );
  });
});
