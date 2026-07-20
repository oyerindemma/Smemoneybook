import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const enforceRateLimit = vi.fn();
const requireBusinessAccess = vi.fn();
const requireLocationAccess = vi.fn();
const requireMinimumPlan = vi.fn();
const calculateAssessment = vi.fn();
const saveSnapshot = vi.fn();
const recordConsent = vi.fn();
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

vi.mock("@/lib/phase3/loan-readiness-service", () => ({
  calculateLoanReadinessForBusiness: calculateAssessment,
  saveLoanReadinessSnapshot: saveSnapshot,
  recordLoanReadinessSharingConsent: recordConsent,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    auditLog: {
      create: createAudit,
    },
  }),
}));

const assessment = {
  businessId: "biz_1",
  formulaVersion: "loan-readiness-v1",
  score: 72,
  rating: "Developing records",
  confidence: "medium",
  generatedAt: "2026-07-19T06:00:00.000Z",
  periodStart: "2026-01-20T06:00:00.000Z",
  periodEnd: "2026-07-19T06:00:00.000Z",
  components: [],
  strengths: [],
  weaknesses: [],
  recommendations: [],
  dataCompleteness: {},
  dataWarnings: ["This is not loan approval and does not guarantee credit."],
  sourceMetrics: {},
  disclaimer: "This is not loan approval.",
};

describe("/api/loan-readiness", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PHASE3_LOAN_READINESS_ENABLED = "true";
    requireUser.mockResolvedValue({ id: "user_1" });
    enforceRateLimit.mockResolvedValue(null);
    requireBusinessAccess.mockResolvedValue({ businessId: "biz_1" });
    requireLocationAccess.mockResolvedValue({ businessId: "biz_1", locationId: "loc_1" });
    requireMinimumPlan.mockResolvedValue(null);
    calculateAssessment.mockResolvedValue(assessment);
    saveSnapshot.mockResolvedValue({ id: "loan_snap_1" });
    recordConsent.mockResolvedValue({ id: "share_1" });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("requires the Phase 3 loan readiness flag", async () => {
    process.env.NEXT_PUBLIC_PHASE3_LOAN_READINESS_ENABLED = "false";
    vi.resetModules();

    const { GET } = await import("@/app/api/loan-readiness/route");
    const response = await GET(new Request("http://localhost/api/loan-readiness?businessId=biz_1"));

    expect(response.status).toBe(404);
    expect(calculateAssessment).not.toHaveBeenCalled();
  });

  it("calculates a gated assessment for an authorized location", async () => {
    const { GET } = await import("@/app/api/loan-readiness/route");
    const response = await GET(new Request("http://localhost/api/loan-readiness?businessId=biz_1&locationId=loc_1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.assessment.score).toBe(72);
    expect(requireBusinessAccess).toHaveBeenCalledWith("user_1", "reports:write", "biz_1");
    expect(requireLocationAccess).toHaveBeenCalledWith({
      userId: "user_1",
      businessId: "biz_1",
      locationId: "loc_1",
      permission: "reports:write",
    });
  });

  it("saves readiness snapshots and audits the action", async () => {
    const { POST } = await import("@/app/api/loan-readiness/route");
    const response = await POST(
      new Request("http://localhost/api/loan-readiness", {
        method: "POST",
        body: JSON.stringify({ businessId: "biz_1", recalculatedFromId: "old_snap" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.snapshotId).toBe("loan_snap_1");
    expect(saveSnapshot).toHaveBeenCalledWith({ assessment, recalculatedFromId: "old_snap" });
    expect(createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "loan_readiness.snapshot_saved",
          businessId: "biz_1",
        }),
      }),
    );
  });

  it("requires explicit consent before logging partner sharing", async () => {
    const { PATCH } = await import("@/app/api/loan-readiness/route");
    const response = await PATCH(
      new Request("http://localhost/api/loan-readiness", {
        method: "PATCH",
        body: JSON.stringify({
          businessId: "biz_1",
          partnerName: "Partner",
          purpose: "Readiness review",
          consentText: "I agree to share this readiness report for review.",
          consentConfirmed: false,
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(recordConsent).not.toHaveBeenCalled();
  });

  it("records sharing consent without performing external sharing", async () => {
    const { PATCH } = await import("@/app/api/loan-readiness/route");
    const response = await PATCH(
      new Request("http://localhost/api/loan-readiness", {
        method: "PATCH",
        body: JSON.stringify({
          businessId: "biz_1",
          snapshotId: "loan_snap_1",
          partnerName: "Partner",
          purpose: "Readiness review",
          consentText: "I agree to share this readiness report for partner review.",
          consentConfirmed: true,
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.sharingLogId).toBe("share_1");
    expect(recordConsent).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        actorId: "user_1",
        snapshotId: "loan_snap_1",
        partnerName: "Partner",
      }),
    );
  });
});
