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

vi.mock("@/lib/phase3/cashflow-forecast-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/phase3/cashflow-forecast-service")>();

  return {
    ...actual,
    calculateCashflowForecastForBusiness: calculateForecast,
    saveCashflowForecastSnapshots: saveSnapshots,
  };
});

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    auditLog: {
      create: createAudit,
    },
  }),
}));

const forecast = {
  businessId: "biz_1",
  formulaVersion: "cashflow-forecast-v1",
  generatedAt: "2026-07-19T06:00:00.000Z",
  periodStart: "2025-05-25T06:00:00.000Z",
  recordedThrough: "2026-07-19T06:00:00.000Z",
  currentCash: 100000,
  recordedMetrics: {
    historyDays: 120,
    activeTransactionCount: 40,
    cashTransactionCount: 36,
    paidSales: 150000,
    paidExpenses: 70000,
    netCashMovement: 80000,
    creditSales: 10000,
    unpaidExpenses: 5000,
    currentCash: 100000,
    dataFreshnessDays: 1,
  },
  dataWarnings: [],
  sourceMetrics: {},
  forecasts: [
    {
      horizonDays: 30,
      confidence: "medium",
      forecastStart: "2026-07-19T06:00:00.000Z",
      forecastEnd: "2026-08-18T06:00:00.000Z",
      openingCash: 100000,
      projectedInflows: 60000,
      projectedOutflows: 35000,
      projectedNetCash: 25000,
      forecastEndingCash: 125000,
      lowerBound: 110000,
      upperBound: 140000,
      assumptions: [],
      alerts: [],
      dataWarnings: [],
      recordedMetrics: {},
      forecastSeries: [],
      sourceMetrics: {},
      backtest: { available: true, horizonDays: 30, accuracyPercent: 80 },
    },
  ],
};

describe("/api/cashflow-forecast", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PHASE3_CASHFLOW_FORECASTS_ENABLED = "true";
    requireUser.mockResolvedValue({ id: "user_1" });
    enforceRateLimit.mockResolvedValue(null);
    requireBusinessAccess.mockResolvedValue({ businessId: "biz_1" });
    requireLocationAccess.mockResolvedValue({ businessId: "biz_1", locationId: "loc_1" });
    requireMinimumPlan.mockResolvedValue(null);
    calculateForecast.mockResolvedValue(forecast);
    saveSnapshots.mockResolvedValue([{ id: "cashflow_snap_1", horizonDays: 30 }]);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("requires the Phase 3 cashflow forecast flag", async () => {
    process.env.NEXT_PUBLIC_PHASE3_CASHFLOW_FORECASTS_ENABLED = "false";
    vi.resetModules();

    const { GET } = await import("@/app/api/cashflow-forecast/route");
    const response = await GET(new Request("http://localhost/api/cashflow-forecast?businessId=biz_1"));

    expect(response.status).toBe(404);
    expect(calculateForecast).not.toHaveBeenCalled();
  });

  it("calculates a gated forecast for an authorized location", async () => {
    const { GET } = await import("@/app/api/cashflow-forecast/route");
    const response = await GET(
      new Request("http://localhost/api/cashflow-forecast?businessId=biz_1&locationId=loc_1&horizonDays=30"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.forecast.currentCash).toBe(100000);
    expect(requireBusinessAccess).toHaveBeenCalledWith("user_1", "reports:write", "biz_1");
    expect(requireLocationAccess).toHaveBeenCalledWith({
      userId: "user_1",
      businessId: "biz_1",
      locationId: "loc_1",
      permission: "reports:write",
    });
    expect(requireMinimumPlan).toHaveBeenCalledWith(
      "user_1",
      "biz_1",
      "growth",
      "Upgrade to Growth to use Cashflow Forecasts.",
    );
    expect(calculateForecast).toHaveBeenCalledWith({
      businessId: "biz_1",
      locationId: "loc_1",
      horizons: [30],
    });
  });

  it("rejects invalid horizons", async () => {
    const { GET } = await import("@/app/api/cashflow-forecast/route");
    const response = await GET(
      new Request("http://localhost/api/cashflow-forecast?businessId=biz_1&horizonDays=365"),
    );

    expect(response.status).toBe(400);
    expect(calculateForecast).not.toHaveBeenCalled();
  });

  it("saves forecast snapshots and audits the action", async () => {
    const { POST } = await import("@/app/api/cashflow-forecast/route");
    const response = await POST(
      new Request("http://localhost/api/cashflow-forecast", {
        method: "POST",
        body: JSON.stringify({ businessId: "biz_1", horizonDays: 30, recalculatedFromId: "cashflow_old" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.snapshotIds).toEqual(["cashflow_snap_1"]);
    expect(saveSnapshots).toHaveBeenCalledWith({
      forecast,
      horizonDays: 30,
      recalculatedFromId: "cashflow_old",
    });
    expect(createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "cashflow_forecast.snapshot_saved",
          businessId: "biz_1",
        }),
      }),
    );
  });
});
