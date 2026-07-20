import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const enforceRateLimit = vi.fn();
const requireBusinessAccess = vi.fn();
const requireLocationAccess = vi.fn();
const requireMinimumPlan = vi.fn();
const calculateDashboard = vi.fn();
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

vi.mock("@/lib/phase3/executive-dashboard-service", () => ({
  calculateExecutiveDashboardForBusiness: calculateDashboard,
  saveExecutiveDashboardSnapshot: saveSnapshot,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    auditLog: {
      create: createAudit,
    },
  }),
}));

const dashboard = {
  formulaVersion: "executive-dashboard-v1",
  periodStart: "2026-07-01T00:00:00.000Z",
  periodEnd: "2026-08-01T00:00:00.000Z",
  generatedAt: "2026-07-19T12:00:00.000Z",
  summary: { revenue: 1000 },
  recommendedActions: [],
  sourceMetrics: {},
  freshness: {},
};

describe("/api/executive-dashboard", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PHASE3_EXECUTIVE_DASHBOARD_ENABLED = "true";
    requireUser.mockResolvedValue({ id: "user_1" });
    enforceRateLimit.mockResolvedValue(null);
    requireBusinessAccess.mockResolvedValue({ businessId: "biz_1" });
    requireLocationAccess.mockResolvedValue({ businessId: "biz_1", locationId: "loc_1" });
    requireMinimumPlan.mockResolvedValue(null);
    calculateDashboard.mockResolvedValue(dashboard);
    saveSnapshot.mockResolvedValue({ id: "snapshot_1" });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("requires the Phase 3 executive dashboard flag", async () => {
    process.env.NEXT_PUBLIC_PHASE3_EXECUTIVE_DASHBOARD_ENABLED = "false";
    vi.resetModules();

    const { GET } = await import("@/app/api/executive-dashboard/route");
    const response = await GET(new Request("http://localhost/api/executive-dashboard?businessId=biz_1"));

    expect(response.status).toBe(404);
    expect(calculateDashboard).not.toHaveBeenCalled();
  });

  it("calculates a Pro-gated dashboard for authorized report users", async () => {
    const { GET } = await import("@/app/api/executive-dashboard/route");
    const response = await GET(
      new Request("http://localhost/api/executive-dashboard?businessId=biz_1&locationId=loc_1&from=2026-07-01&to=2026-08-01"),
    );

    expect(response.status).toBe(200);
    expect(requireBusinessAccess).toHaveBeenCalledWith("user_1", "reports:write", "biz_1");
    expect(requireLocationAccess).toHaveBeenCalledWith({
      userId: "user_1",
      businessId: "biz_1",
      locationId: "loc_1",
      permission: "reports:write",
    });
    expect(requireMinimumPlan).toHaveBeenCalledWith("user_1", "biz_1", "pro", "Upgrade to Pro to use Executive Dashboard.");
  });

  it("saves dashboard snapshots and audits them", async () => {
    const { POST } = await import("@/app/api/executive-dashboard/route");
    const response = await POST(
      new Request("http://localhost/api/executive-dashboard", {
        method: "POST",
        body: JSON.stringify({
          businessId: "biz_1",
          periodStart: "2026-07-01T00:00:00.000Z",
          periodEnd: "2026-08-01T00:00:00.000Z",
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.snapshotId).toBe("snapshot_1");
    expect(saveSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        dashboard,
      }),
    );
    expect(createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "executive_dashboard.snapshot_saved",
        }),
      }),
    );
  });
});
