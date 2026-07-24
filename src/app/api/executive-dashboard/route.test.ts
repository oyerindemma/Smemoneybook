import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExecutiveDashboardAccessError } from "@/lib/executive-dashboard/authorization";
import {
  calculateExecutiveDashboard,
  resolveExecutiveDashboardPeriod,
} from "@/lib/executive-dashboard/service";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  enforceRateLimit: vi.fn(),
  requireAccess: vi.fn(),
  getSummary: vi.fn(),
  getDrilldown: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));

vi.mock("@/lib/executive-dashboard/authorization", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/executive-dashboard/authorization")>();
  return {
    ...actual,
    requireExecutiveDashboardAccess: mocks.requireAccess,
  };
});

vi.mock("@/lib/executive-dashboard/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/executive-dashboard/service")>();
  return {
    ...actual,
    getExecutiveDashboardSummary: mocks.getSummary,
    getExecutiveDashboardDrilldown: mocks.getDrilldown,
  };
});

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    auditLog: {
      create: mocks.auditCreate,
    },
  }),
}));

const access = {
  businessId: "biz_1",
  businessName: "Preview Shop",
  currency: "NGN",
  userId: "user_1",
  role: "OWNER",
  canViewSensitive: true,
  canViewStaffSummary: true,
};

function dashboardFixture() {
  const period = resolveExecutiveDashboardPeriod({
    preset: "custom",
    from: "2026-07-01T00:00:00.000Z",
    to: "2026-08-01T00:00:00.000Z",
    now: new Date("2026-07-24T12:00:00.000Z"),
  });

  return calculateExecutiveDashboard({
    business: { id: "biz_1", name: "Preview Shop", currency: "NGN" },
    location: { id: null, name: "All locations" },
    period: period.period,
    comparisonPeriod: period.comparisonPeriod,
    generatedAt: new Date("2026-07-24T12:00:00.000Z"),
    transactions: [
      {
        id: "sale_1",
        type: "SALE",
        amount: "1000",
        profit: "300",
        costOfGoods: "700",
        description: "Sale",
        category: "Sales",
        paymentStatus: "PAID",
        occurredAt: "2026-07-10T00:00:00.000Z",
        customerId: "customer_1",
      },
    ],
    debts: [],
    inventoryItems: [],
    locations: [],
    pendingTransfers: 0,
    bankRows: [],
    taxSummary: null,
    taxError: "Tax setup required.",
    staffSummary: null,
  });
}

describe("Executive Dashboard APIs", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user_1", email: "owner@example.test" });
    mocks.enforceRateLimit.mockResolvedValue(null);
    mocks.requireAccess.mockResolvedValue(access);
    mocks.getSummary.mockResolvedValue(dashboardFixture());
    mocks.getDrilldown.mockResolvedValue({
      type: "revenue",
      period: dashboardFixture().period,
      generatedAt: "2026-07-24T12:00:00.000Z",
      rows: [{ id: "sale_1", amount: 1000 }],
      total: 1,
      dataQualityStatus: "complete",
    });
    mocks.auditCreate.mockResolvedValue({ id: "audit_1" });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns a summary for an authorized Executive Dashboard reader", async () => {
    const { GET } = await import("@/app/api/executive-dashboard/summary/route");
    const response = await GET(
      new Request("http://localhost/api/executive-dashboard/summary?businessId=biz_1&preset=this_month"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.dashboard.headline.sales.value).toBe(1000);
    expect(mocks.requireAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        businessId: "biz_1",
        permission: "executive_dashboard:read",
      }),
    );
    expect(mocks.getSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        includeStaffSummary: true,
      }),
    );
  });

  it("returns attention items from the same canonical summary", async () => {
    const { GET } = await import("@/app/api/executive-dashboard/attention/route");
    const response = await GET(
      new Request("http://localhost/api/executive-dashboard/attention?businessId=biz_1"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.attention[0]?.id).toBe("attention:tax_readiness");
    expect(payload.dataQuality.status).toBe("setup_required");
  });

  it("validates and returns typed drill-down rows", async () => {
    const { GET } = await import("@/app/api/executive-dashboard/drilldown/route");
    const response = await GET(
      new Request("http://localhost/api/executive-dashboard/drilldown?businessId=biz_1&type=revenue"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.drilldown.type).toBe("revenue");
    expect(mocks.getDrilldown).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "revenue",
        includeStaffSummary: true,
      }),
    );
  });

  it("exports a CSV report", async () => {
    const { GET } = await import("@/app/api/executive-dashboard/export/route");
    const response = await GET(
      new Request("http://localhost/api/executive-dashboard/export?businessId=biz_1"),
    );
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(csv).toContain("executive.revenue.total_sales.v2");
    expect(mocks.requireAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        permission: "executive_dashboard:export",
      }),
    );
  });

  it("rejects unauthorized users", async () => {
    mocks.requireUser.mockRejectedValueOnce(new Response("Unauthorized", { status: 401 }));

    const { GET } = await import("@/app/api/executive-dashboard/summary/route");
    const response = await GET(
      new Request("http://localhost/api/executive-dashboard/summary?businessId=biz_1"),
    );

    expect(response.status).toBe(401);
    expect(mocks.getSummary).not.toHaveBeenCalled();
  });

  it("surfaces cross-business access rejection", async () => {
    mocks.requireAccess.mockRejectedValueOnce(
      new ExecutiveDashboardAccessError("You do not have access to this business.", 403, "business_access_denied"),
    );

    const { GET } = await import("@/app/api/executive-dashboard/summary/route");
    const response = await GET(
      new Request("http://localhost/api/executive-dashboard/summary?businessId=other_biz"),
    );

    expect(response.status).toBe(403);
  });

  it("returns 405 for unsupported writes on read endpoints", async () => {
    const summaryRoute = await import("@/app/api/executive-dashboard/summary/route");
    const response = summaryRoute.POST();

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
  });
});
