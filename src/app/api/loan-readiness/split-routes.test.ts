import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoanReadinessAccessError } from "@/lib/loan-readiness/authorization";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  enforceRateLimit: vi.fn(),
  requireAccess: vi.fn(),
  calculateReport: vi.fn(),
  saveReport: vi.fn(),
  listHistory: vi.fn(),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  createAudit: vi.fn(),
  buildCsv: vi.fn(),
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
  listLoanReadinessHistory: mocks.listHistory,
  getLoanReadinessProfile: mocks.getProfile,
  updateLoanReadinessProfile: mocks.updateProfile,
}));
vi.mock("@/lib/loan-readiness/export", () => ({ buildLoanReadinessCsv: mocks.buildCsv }));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({ auditLog: { create: mocks.createAudit } }),
}));

const capabilities = { canRead: true, canGenerate: true, canExport: true, canManageProfile: true };
const access = {
  businessId: "biz_1",
  businessName: "Preview Shop",
  currency: "NGN",
  userId: "user_1",
  role: "OWNER",
  capabilities,
};
const profile = { preferredCurrency: "NGN", consentToShare: false, documents: [] };
const report = {
  business: { id: "biz_1", name: "Preview Shop", currency: "NGN" },
  location: { id: null, name: "All locations" },
  formulaVersion: "LR_COMPOSITE_V1",
  generatedAt: "2026-09-29T10:00:00.000Z",
  expiresAt: "2026-10-29T10:00:00.000Z",
  percentage: 75,
  overallStatus: "Needs attention",
  categories: [{ id: "business_profile", label: "Profile" }],
  evidence: { sourceCounts: { transactions: 10 } },
  recommendations: [],
  profile,
  disclaimer: "Not a lending decision.",
};

describe("Loan Readiness split APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user_1" });
    mocks.enforceRateLimit.mockResolvedValue(null);
    mocks.requireAccess.mockResolvedValue(access);
    mocks.calculateReport.mockResolvedValue(report);
    mocks.saveReport.mockResolvedValue({ id: "snapshot_1" });
    mocks.listHistory.mockResolvedValue([{ id: "snapshot_1", percentage: 75 }]);
    mocks.getProfile.mockResolvedValue(profile);
    mocks.updateProfile.mockResolvedValue({ ...profile, industry: "Retail" });
    mocks.createAudit.mockResolvedValue({});
    mocks.buildCsv.mockReturnValue("Category,Status\nProfile,Ready\n");
  });

  it("separates summary, categories, and evidence reads", async () => {
    const summary = await import("@/app/api/loan-readiness/summary/route");
    const categories = await import("@/app/api/loan-readiness/categories/route");
    const evidence = await import("@/app/api/loan-readiness/evidence/route");
    const url = "http://localhost/api/loan-readiness/summary?businessId=biz_1";

    const summaryResponse = await summary.GET(new Request(url));
    const categoryResponse = await categories.GET(new Request(url));
    const evidenceResponse = await evidence.GET(new Request(url));

    expect(summaryResponse.status).toBe(200);
    expect((await summaryResponse.json()).capabilities).toEqual(capabilities);
    expect((await categoryResponse.json()).categories).toEqual(report.categories);
    expect((await evidenceResponse.json()).evidence).toEqual(report.evidence);
    expect(mocks.requireAccess).toHaveBeenCalledWith(expect.objectContaining({ permission: "loan_readiness:read" }));
  });

  it("generates and records history through separate endpoints", async () => {
    const generate = await import("@/app/api/loan-readiness/generate/route");
    const history = await import("@/app/api/loan-readiness/history/route");
    const generated = await generate.POST(new Request("http://localhost/api/loan-readiness/generate", {
      method: "POST",
      body: JSON.stringify({ businessId: "biz_1" }),
    }));
    const historyResponse = await history.GET(new Request("http://localhost/api/loan-readiness/history?businessId=biz_1"));

    expect(generated.status).toBe(201);
    expect((await generated.json()).snapshotId).toBe("snapshot_1");
    expect((await historyResponse.json()).history).toHaveLength(1);
    expect(mocks.saveReport).toHaveBeenCalledWith({ report, generatedByUserId: "user_1", recalculatedFromId: undefined });
  });

  it("requires profile-management permission for profile writes", async () => {
    const route = await import("@/app/api/loan-readiness/profile/route");
    const response = await route.PUT(new Request("http://localhost/api/loan-readiness/profile", {
      method: "PUT",
      body: JSON.stringify({
        businessId: "biz_1",
        industry: "Retail",
        preferredCurrency: "NGN",
        consentToShare: false,
        documents: [],
      }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.requireAccess).toHaveBeenCalledWith({
      userId: "user_1",
      businessId: "biz_1",
      permission: "loan_readiness:manage_profile",
    });
    expect(mocks.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ businessId: "biz_1" }));
  });

  it("exports only after export authorization", async () => {
    const route = await import("@/app/api/loan-readiness/export/route");
    const response = await route.GET(new Request("http://localhost/api/loan-readiness/export?businessId=biz_1"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(await response.text()).toContain("Profile,Ready");
    expect(mocks.requireAccess).toHaveBeenCalledWith(expect.objectContaining({ permission: "loan_readiness:export" }));
  });

  it("preserves 401/403 access failures without querying report data", async () => {
    mocks.requireAccess.mockRejectedValueOnce(
      new LoanReadinessAccessError("You do not have access to this business.", 403, "business_access_denied"),
    );
    const route = await import("@/app/api/loan-readiness/summary/route");
    const response = await route.GET(new Request("http://localhost/api/loan-readiness/summary?businessId=other_biz"));

    expect(response.status).toBe(403);
    expect(mocks.calculateReport).not.toHaveBeenCalled();

    mocks.requireUser.mockRejectedValueOnce(new Response("Unauthorized", { status: 401, statusText: "Unauthorized" }));
    const unauthenticated = await route.GET(new Request("http://localhost/api/loan-readiness/summary?businessId=biz_1"));
    expect(unauthenticated.status).toBe(401);
  });

  it("returns 405 for write methods on read-only resources", async () => {
    const route = await import("@/app/api/loan-readiness/categories/route");
    for (const method of [route.POST, route.PUT, route.PATCH, route.DELETE]) {
      const response = method();
      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("GET");
    }
  });
});
