import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const enforceRateLimit = vi.fn();
const requireBusinessAccess = vi.fn();
const requireLocationAccess = vi.fn();
const requireMinimumPlan = vi.fn();
const calculateScore = vi.fn();
const saveSnapshot = vi.fn();
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

vi.mock("@/lib/phase3/health-score-service", () => ({
  calculateBusinessHealthScoreForBusiness: calculateScore,
  saveBusinessHealthScoreSnapshot: saveSnapshot,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    auditLog: {
      create: createAudit,
    },
  }),
}));

const score = {
  businessId: "biz_1",
  formulaVersion: "health-score-v1",
  score: 78,
  rating: "Good",
  confidence: "medium",
  generatedAt: "2026-07-19T06:00:00.000Z",
  periodStart: "2026-06-19T00:00:00.000Z",
  periodEnd: "2026-07-19T06:00:00.000Z",
  components: [],
  recommendations: ["Send reminders to overdue customers."],
  dataWarnings: [],
  sourceMetrics: {
    currentTransactionCount: 10,
    previousTransactionCount: 8,
    currentSales: 100000,
    previousSales: 90000,
    currentExpenses: 30000,
    previousExpenses: 25000,
    currentProfit: 70000,
    previousProfit: 65000,
    cashAvailable: 200000,
    openCustomerDebt: 10000,
    overdueCustomerDebt: 5000,
    openSupplierBills: 0,
    lowStockCount: 1,
    inventoryItemCount: 5,
  },
};

describe("/api/health-score", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PHASE3_HEALTH_SCORE_ENABLED = "true";
    requireUser.mockResolvedValue({ id: "user_1" });
    enforceRateLimit.mockResolvedValue(null);
    requireBusinessAccess.mockResolvedValue({ businessId: "biz_1" });
    requireLocationAccess.mockResolvedValue({ businessId: "biz_1", locationId: "loc_1" });
    requireMinimumPlan.mockResolvedValue(null);
    calculateScore.mockResolvedValue(score);
    saveSnapshot.mockResolvedValue({ id: "snap_1" });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("requires the Phase 3 health score flag", async () => {
    process.env.NEXT_PUBLIC_PHASE3_HEALTH_SCORE_ENABLED = "false";
    vi.resetModules();

    const { GET } = await import("@/app/api/health-score/route");
    const response = await GET(new Request("http://localhost/api/health-score?businessId=biz_1"));

    expect(response.status).toBe(404);
    expect(calculateScore).not.toHaveBeenCalled();
  });

  it("calculates a gated health score for an authorized business", async () => {
    const { GET } = await import("@/app/api/health-score/route");
    const response = await GET(new Request("http://localhost/api/health-score?businessId=biz_1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.score.score).toBe(78);
    expect(requireBusinessAccess).toHaveBeenCalledWith("user_1", "reports:write", "biz_1");
    expect(requireMinimumPlan).toHaveBeenCalledWith(
      "user_1",
      "biz_1",
      "growth",
      "Upgrade to Growth to use Business Health Score.",
    );
  });

  it("saves a recalculated snapshot and audits the action", async () => {
    const { POST } = await import("@/app/api/health-score/route");
    const response = await POST(
      new Request("http://localhost/api/health-score", {
        method: "POST",
        body: JSON.stringify({ businessId: "biz_1", recalculatedFromId: "snap_old" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.snapshotId).toBe("snap_1");
    expect(saveSnapshot).toHaveBeenCalledWith({ score, recalculatedFromId: "snap_old" });
    expect(createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "health_score.snapshot_saved",
          businessId: "biz_1",
        }),
      }),
    );
  });
});
