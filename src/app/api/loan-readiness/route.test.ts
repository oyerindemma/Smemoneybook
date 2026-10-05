import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoanReadinessAccessError } from "@/lib/loan-readiness/authorization";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  enforceRateLimit: vi.fn(),
  requireAccess: vi.fn(),
  calculateReport: vi.fn(),
  saveReport: vi.fn(),
  recordConsent: vi.fn(),
  createAudit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/auth/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/loan-readiness/authorization", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/loan-readiness/authorization")>()),
  requireLoanReadinessAccess: mocks.requireAccess,
}));
vi.mock("@/lib/loan-readiness/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/loan-readiness/service")>()),
  calculateLoanReadinessReport: mocks.calculateReport,
  saveLoanReadinessReport: mocks.saveReport,
}));
vi.mock("@/lib/phase3/loan-readiness-service", () => ({
  recordLoanReadinessSharingConsent: mocks.recordConsent,
}));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({ auditLog: { create: mocks.createAudit } }),
}));

const report = {
  business: { id: "biz_1", name: "Preview Shop", currency: "NGN" },
  location: { id: "loc_1", name: "Main shop" },
  formulaVersion: "LR_COMPOSITE_V1",
  generatedAt: "2026-09-29T10:00:00.000Z",
  expiresAt: "2026-10-29T10:00:00.000Z",
  percentage: 72,
  overallStatus: "Needs attention",
  categories: [],
  evidence: {
    period: { start: "2026-04-02T10:00:00.000Z", end: "2026-09-29T10:00:00.000Z", days: 180 },
    sourceCounts: { transactions: 20, payments: 4, openDebts: 1, bankRows: 10, taxSnapshots: 1, inventoryItems: 2, inventoryMovements: 3, issuedDocuments: 1, checklistDocuments: 6 },
    activityMonths: ["2026-08", "2026-09"],
    salesMonths: ["2026-08", "2026-09"],
    expenseMonths: ["2026-09"],
    cashMovementMonths: ["2026-08", "2026-09"],
    bank: { totalRows: 10, coveredRows: 8, unresolvedRows: 2, unresolvedAmount: 1000 },
    debt: { openCustomerReceivables: 1000, overdueCustomerReceivables: 0, topDebtorConcentrationPercent: 20, openSupplierObligations: 0 },
    tax: { profileConfigured: true, snapshotCount: 1, openCriticalReviewItems: 0, openReviewItems: 0 },
    dataQuality: { missingCategories: 0, missingPartyLinks: 1, duplicateFingerprints: 0, reversalCount: 0, unresolvedBankRows: 2, openTaxReviewItems: 0 },
    limitations: [],
  },
  recommendations: ["Record expenses every month."],
  profile: { preferredCurrency: "NGN", consentToShare: false, documents: [] },
  disclaimer: "This assessment measures records. It is not a lending decision.",
};

const access = {
  businessId: "biz_1",
  businessName: "Preview Shop",
  currency: "NGN",
  userId: "user_1",
  role: "OWNER",
  locationId: "loc_1",
  locationName: "Main shop",
  capabilities: { canRead: true, canGenerate: true, canExport: true, canManageProfile: true },
};

describe("/api/loan-readiness compatibility route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user_1" });
    mocks.enforceRateLimit.mockResolvedValue(null);
    mocks.requireAccess.mockResolvedValue(access);
    mocks.calculateReport.mockResolvedValue(report);
    mocks.saveReport.mockResolvedValue({ id: "loan_snap_1" });
    mocks.recordConsent.mockResolvedValue({ id: "share_1" });
    mocks.createAudit.mockResolvedValue({});
  });

  afterEach(() => vi.resetModules());

  it("loads only after dedicated read authorization", async () => {
    const { GET } = await import("@/app/api/loan-readiness/route");
    const response = await GET(new Request("http://localhost/api/loan-readiness?businessId=biz_1&locationId=loc_1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.report.percentage).toBe(72);
    expect(mocks.requireAccess).toHaveBeenCalledWith({
      userId: "user_1",
      businessId: "biz_1",
      locationId: "loc_1",
      permission: "loan_readiness:read",
    });
  });

  it("returns the access-layer status for a disabled feature", async () => {
    mocks.requireAccess.mockRejectedValueOnce(
      new LoanReadinessAccessError("Loan Readiness is unavailable in this environment.", 503, "feature_disabled"),
    );
    const { GET } = await import("@/app/api/loan-readiness/route");
    const response = await GET(new Request("http://localhost/api/loan-readiness?businessId=biz_1"));

    expect(response.status).toBe(503);
    expect(mocks.calculateReport).not.toHaveBeenCalled();
  });

  it("generates a business-scoped auditable snapshot", async () => {
    const { POST } = await import("@/app/api/loan-readiness/route");
    const response = await POST(new Request("http://localhost/api/loan-readiness", {
      method: "POST",
      body: JSON.stringify({ businessId: "biz_1", locationId: "loc_1", recalculatedFromId: "old_snap" }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.snapshotId).toBe("loan_snap_1");
    expect(mocks.requireAccess).toHaveBeenCalledWith(expect.objectContaining({ permission: "loan_readiness:generate" }));
    expect(mocks.saveReport).toHaveBeenCalledWith({
      report,
      generatedByUserId: "user_1",
      recalculatedFromId: "old_snap",
    });
  });

  it("requires explicit consent before logging partner sharing", async () => {
    const { PATCH } = await import("@/app/api/loan-readiness/route");
    const response = await PATCH(new Request("http://localhost/api/loan-readiness", {
      method: "PATCH",
      body: JSON.stringify({
        businessId: "biz_1",
        partnerName: "Partner",
        purpose: "Readiness review",
        consentText: "I agree to share this readiness report for review.",
        consentConfirmed: false,
      }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.recordConsent).not.toHaveBeenCalled();
  });

  it("records consent without performing external sharing", async () => {
    const { PATCH } = await import("@/app/api/loan-readiness/route");
    const response = await PATCH(new Request("http://localhost/api/loan-readiness", {
      method: "PATCH",
      body: JSON.stringify({
        businessId: "biz_1",
        snapshotId: "loan_snap_1",
        partnerName: "Partner",
        purpose: "Readiness review",
        consentText: "I agree to share this readiness report for partner review.",
        consentConfirmed: true,
      }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.message).toContain("No external sharing");
    expect(mocks.requireAccess).toHaveBeenCalledWith(expect.objectContaining({ permission: "loan_readiness:manage_profile" }));
  });

  it("returns explicit 405 responses for unsupported methods", async () => {
    const { PUT, DELETE } = await import("@/app/api/loan-readiness/route");
    for (const method of [PUT, DELETE]) {
      const response = method();
      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("GET, POST, PATCH");
    }
  });
});
