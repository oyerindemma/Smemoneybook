import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const enforceRateLimit = vi.fn();
const requireBusinessAccess = vi.fn();
const requireLocationAccess = vi.fn();
const requireMinimumPlan = vi.fn();
const calculateSummary = vi.fn();
const createGoal = vi.fn();
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

vi.mock("@/lib/phase3/staff-performance-service", () => ({
  calculateStaffPerformanceForBusiness: calculateSummary,
  createStaffPerformanceGoal: createGoal,
  saveStaffPerformanceSnapshot: saveSnapshot,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    auditLog: {
      create: createAudit,
    },
  }),
}));

const summary = {
  formulaVersion: "staff-performance-v1",
  periodStart: "2026-07-01T00:00:00.000Z",
  periodEnd: "2026-08-01T00:00:00.000Z",
  generatedAt: "2026-07-19T10:00:00.000Z",
  rows: [],
  warnings: [],
  sourceMetrics: {},
  metricDefinitions: {},
};

describe("/api/staff-performance", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PHASE3_STAFF_PERFORMANCE_ENABLED = "true";
    requireUser.mockResolvedValue({ id: "user_1" });
    enforceRateLimit.mockResolvedValue(null);
    requireBusinessAccess.mockResolvedValue({ businessId: "biz_1" });
    requireLocationAccess.mockResolvedValue({ businessId: "biz_1", locationId: "loc_1" });
    requireMinimumPlan.mockResolvedValue(null);
    calculateSummary.mockResolvedValue(summary);
    createGoal.mockResolvedValue({ id: "goal_1" });
    saveSnapshot.mockResolvedValue({ id: "snapshot_1" });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("requires the Phase 3 staff performance flag", async () => {
    process.env.NEXT_PUBLIC_PHASE3_STAFF_PERFORMANCE_ENABLED = "false";
    vi.resetModules();

    const { GET } = await import("@/app/api/staff-performance/route");
    const response = await GET(new Request("http://localhost/api/staff-performance?businessId=biz_1"));

    expect(response.status).toBe(404);
    expect(calculateSummary).not.toHaveBeenCalled();
  });

  it("allows reports users to read staff performance", async () => {
    const { GET } = await import("@/app/api/staff-performance/route");
    const response = await GET(
      new Request("http://localhost/api/staff-performance?businessId=biz_1&locationId=loc_1&from=2026-07-01&to=2026-08-01"),
    );

    expect(response.status).toBe(200);
    expect(requireBusinessAccess).toHaveBeenCalledWith("user_1", "reports:write", "biz_1");
    expect(requireLocationAccess).toHaveBeenCalledWith({
      userId: "user_1",
      businessId: "biz_1",
      locationId: "loc_1",
      permission: "reports:write",
    });
  });

  it("requires admin access to create goals", async () => {
    const { POST } = await import("@/app/api/staff-performance/route");
    const response = await POST(
      new Request("http://localhost/api/staff-performance", {
        method: "POST",
        body: JSON.stringify({
          action: "create_goal",
          businessId: "biz_1",
          label: "Record 20 sales",
          metric: "salesRecorded",
          targetValue: 20,
          periodStart: "2026-07-01T00:00:00.000Z",
          periodEnd: "2026-08-01T00:00:00.000Z",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(requireBusinessAccess).toHaveBeenCalledWith("user_1", "admin", "biz_1");
    expect(createGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        actorId: "user_1",
        metric: "salesRecorded",
        targetValue: 20,
      }),
    );
  });

  it("saves staff performance snapshots and audits the action", async () => {
    const { POST } = await import("@/app/api/staff-performance/route");
    const response = await POST(
      new Request("http://localhost/api/staff-performance", {
        method: "POST",
        body: JSON.stringify({
          action: "save_snapshot",
          businessId: "biz_1",
          periodStart: "2026-07-01T00:00:00.000Z",
          periodEnd: "2026-08-01T00:00:00.000Z",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(saveSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        summary,
      }),
    );
    expect(createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "staff_performance.save_snapshot",
        }),
      }),
    );
  });
});
