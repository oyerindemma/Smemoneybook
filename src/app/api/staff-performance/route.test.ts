import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffPerformanceAccessError } from "@/lib/staff-performance/authorization";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  enforceRateLimit: vi.fn(),
  requireStaffPerformanceAccess: vi.fn(),
  assertStaffMemberBelongsToBusiness: vi.fn(),
  getStaffPerformanceSummary: vi.fn(),
  getStaffPerformanceDetail: vi.fn(),
  createAudit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));

vi.mock("@/lib/staff-performance/authorization", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/staff-performance/authorization")>();

  return {
    ...actual,
    requireStaffPerformanceAccess: mocks.requireStaffPerformanceAccess,
    assertStaffMemberBelongsToBusiness: mocks.assertStaffMemberBelongsToBusiness,
  };
});

vi.mock("@/lib/staff-performance/service", () => ({
  getStaffPerformanceSummary: mocks.getStaffPerformanceSummary,
  getStaffPerformanceDetail: mocks.getStaffPerformanceDetail,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    auditLog: {
      create: mocks.createAudit,
    },
  }),
}));

const summary = {
  formulaVersion: "staff-performance-v1",
  business: { id: "biz_1", name: "Demo Shop", currency: "NGN" },
  location: { id: null, name: "All locations" },
  period: {
    preset: "custom",
    label: "July",
    start: "2026-07-01T00:00:00.000Z",
    end: "2026-08-01T00:00:00.000Z",
  },
  comparisonPeriod: {
    start: "2026-06-01T00:00:00.000Z",
    end: "2026-07-01T00:00:00.000Z",
  },
  generatedAt: "2026-07-23T10:00:00.000Z",
  rows: [
    {
      staff: { userId: "staff_1", name: "Tunde", role: "STAFF" },
      metrics: {
        salesAmountRecorded: 12000,
        salesTransactions: 1,
        salesTransactionsWithAmount: 1,
        averageTransactionValue: 12000,
        invoicesCreated: 0,
        expensesRecorded: 0,
        debtCollectionsRecorded: 0,
        debtCollectionsAmount: 0,
        supplierSettlementsRecorded: 0,
        supplierSettlementsAmount: 0,
        stockInOperations: 0,
        stockOutOperations: 0,
        warehouseTransferActions: 0,
        reversalsCorrections: 0,
        activeDays: 1,
        lastRecordedActivity: "2026-07-05T10:00:00.000Z",
        salesContributionPercent: 100,
      },
      comparison: {
        salesAmountRecorded: 0,
        salesTransactions: 0,
        activeDays: 0,
      },
      dataQualityNotes: [],
    },
  ],
  totals: {},
  summaryCards: {
    attributedSalesAmount: 12000,
    salesTransactions: 1,
    averageTransactionValue: 12000,
    activeStaff: 1,
    unattributedRecords: 0,
  },
  unattributedRecords: {},
  dataQualityNotes: [],
  metricDefinitions: {},
  disclaimer: "Operational activity indicator — not an employment decision.",
};

describe("/api/staff-performance", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user_1" });
    mocks.enforceRateLimit.mockResolvedValue(null);
    mocks.requireStaffPerformanceAccess.mockResolvedValue({
      businessId: "biz_1",
      businessName: "Demo Shop",
      currency: "NGN",
      userId: "user_1",
      role: "OWNER",
    });
    mocks.assertStaffMemberBelongsToBusiness.mockResolvedValue(undefined);
    mocks.getStaffPerformanceSummary.mockResolvedValue(summary);
    mocks.getStaffPerformanceDetail.mockResolvedValue({ summary, row: summary.rows[0] });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("loads a read-only summary with date and location filters", async () => {
    mocks.requireStaffPerformanceAccess.mockResolvedValueOnce({
      businessId: "biz_1",
      businessName: "Demo Shop",
      currency: "NGN",
      userId: "user_1",
      role: "OWNER",
      locationId: "loc_1",
    });

    const { GET } = await import("@/app/api/staff-performance/summary/route");
    const response = await GET(
      new Request(
        "http://localhost/api/staff-performance/summary?businessId=biz_1&locationId=loc_1&range=custom&from=2026-07-01&to=2026-07-31",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.requireStaffPerformanceAccess).toHaveBeenCalledWith({
      userId: "user_1",
      businessId: "biz_1",
      locationId: "loc_1",
      permission: "staff_performance:read",
    });
    expect(mocks.getStaffPerformanceSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        locationId: "loc_1",
      }),
    );
    expect(mocks.createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "staff_performance.report_viewed",
          businessId: "biz_1",
        }),
      }),
    );
  });

  it("returns a truthful disabled state when access gate rejects the feature", async () => {
    mocks.requireStaffPerformanceAccess.mockRejectedValue(
      new StaffPerformanceAccessError("Staff Performance is unavailable in this environment.", 503, "feature_disabled"),
    );

    const { GET } = await import("@/app/api/staff-performance/summary/route");
    const response = await GET(new Request("http://localhost/api/staff-performance/summary?businessId=biz_1"));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toContain("unavailable");
  });

  it("rejects cross-business staff detail access", async () => {
    mocks.assertStaffMemberBelongsToBusiness.mockRejectedValue(
      new StaffPerformanceAccessError("Choose a staff member in this business.", 404, "staff_not_found"),
    );

    const { GET } = await import("@/app/api/staff-performance/[staffId]/route");
    const response = await GET(
      new Request("http://localhost/api/staff-performance/staff_foreign?businessId=biz_1"),
      { params: Promise.resolve({ staffId: "staff_foreign" }) },
    );

    expect(response.status).toBe(404);
    expect(mocks.getStaffPerformanceDetail).not.toHaveBeenCalled();
  });

  it("requires export permission for CSV", async () => {
    const { GET } = await import("@/app/api/staff-performance/export/route");
    const response = await GET(new Request("http://localhost/api/staff-performance/export?businessId=biz_1"));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(text).toContain("Operational activity indicator");
    expect(mocks.requireStaffPerformanceAccess).toHaveBeenCalledWith({
      userId: "user_1",
      businessId: "biz_1",
      locationId: undefined,
      permission: "staff_performance:export",
    });
  });

  it("does not expose write operations", async () => {
    const { POST } = await import("@/app/api/staff-performance/route");
    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(405);
    expect(payload.error).toBe("Staff Performance is read-only.");
  });
});
