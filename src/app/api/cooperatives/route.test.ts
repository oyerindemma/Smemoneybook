import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const enforceRateLimit = vi.fn();
const requireLocationAccess = vi.fn();
const requireCooperativesAccess = vi.fn();
const listDashboard = vi.fn();
const createGroup = vi.fn();
const addMember = vi.fn();
const createPlan = vi.fn();
const recordContribution = vi.fn();
const requestLoan = vi.fn();
const recordRepayment = vi.fn();
const createAudit = vi.fn();

class MockCooperativesAccessError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "CooperativesAccessError";
    this.status = status;
    this.code = code;
  }
}

vi.mock("@/lib/auth/session", () => ({
  requireUser,
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  enforceRateLimit,
}));

vi.mock("@/lib/operations/access", () => ({
  requireLocationAccess,
}));

vi.mock("@/lib/cooperatives/authorization", () => ({
  CooperativesAccessError: MockCooperativesAccessError,
  requireCooperativesAccess,
}));

vi.mock("@/lib/cooperatives/contributions", () => ({
  listCooperativeDashboard: listDashboard,
  createCooperativeGroup: createGroup,
  addCooperativeMember: addMember,
  createContributionPlan: createPlan,
  recordCooperativeContribution: recordContribution,
}));

vi.mock("@/lib/cooperatives/loans", () => ({
  requestCooperativeLoan: requestLoan,
}));

vi.mock("@/lib/cooperatives/repayments", () => ({
  recordCooperativeLoanRepayment: recordRepayment,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    auditLog: {
      create: createAudit,
    },
  }),
}));

describe("/api/cooperatives", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user_1" });
    enforceRateLimit.mockResolvedValue(null);
    requireCooperativesAccess.mockResolvedValue({
      businessId: "biz_1",
      businessName: "Demo Business",
      currency: "NGN",
      userId: "user_1",
      role: "OWNER",
      canRead: true,
      canManage: true,
      canManageMembers: true,
      canRecordContributions: true,
      canReviewLoans: true,
      canApproveLoans: true,
      canRecordDisbursement: true,
      canRecordRepayment: true,
      canExport: true,
      canViewMemberSensitive: true,
    });
    requireLocationAccess.mockResolvedValue({ businessId: "biz_1", locationId: "loc_1" });
    listDashboard.mockResolvedValue([{ id: "group_1", name: "Market Savings", summary: { groupCashBalance: 0 } }]);
    createGroup.mockResolvedValue({ id: "group_1", name: "Market Savings" });
    addMember.mockResolvedValue({ id: "member_1" });
    createPlan.mockResolvedValue({ id: "plan_1" });
    recordContribution.mockResolvedValue({ id: "contribution_1" });
    requestLoan.mockResolvedValue({ id: "loan_1" });
    recordRepayment.mockResolvedValue({ id: "repayment_1" });
    createAudit.mockResolvedValue({ id: "audit_1" });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns the Cooperatives server-gate error when the feature is disabled", async () => {
    requireCooperativesAccess.mockRejectedValueOnce(
      new MockCooperativesAccessError("Cooperatives are unavailable in this environment.", 503, "feature_disabled"),
    );

    const { GET } = await import("@/app/api/cooperatives/route");
    const response = await GET(new Request("http://localhost/api/cooperatives?businessId=biz_1"));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toContain("unavailable");
    expect(listDashboard).not.toHaveBeenCalled();
  });

  it("lists cooperative groups for an authorized Pro business", async () => {
    const { GET } = await import("@/app/api/cooperatives/route");
    const response = await GET(new Request("http://localhost/api/cooperatives?businessId=biz_1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.groups[0].id).toBe("group_1");
    expect(requireCooperativesAccess).toHaveBeenCalledWith({
      userId: "user_1",
      businessId: "biz_1",
      permission: "cooperatives:read",
    });
    expect(listDashboard).toHaveBeenCalledWith({
      businessId: "biz_1",
      includeSensitive: true,
    });
  });

  it("creates a location-scoped group after location access is checked", async () => {
    const { POST } = await import("@/app/api/cooperatives/route");
    const response = await POST(
      new Request("http://localhost/api/cooperatives", {
        method: "POST",
        headers: { origin: "http://localhost", host: "localhost", "x-forwarded-proto": "http" },
        body: JSON.stringify({
          action: "create_group",
          businessId: "biz_1",
          locationId: "loc_1",
          name: "Market Savings",
          contributionAmount: 5000,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(requireCooperativesAccess).toHaveBeenCalledWith({
      userId: "user_1",
      businessId: "biz_1",
      permission: "cooperatives:manage",
    });
    expect(requireLocationAccess).toHaveBeenCalledWith({
      userId: "user_1",
      businessId: "biz_1",
      locationId: "loc_1",
      permission: "locations:view",
    });
    expect(createGroup).toHaveBeenCalledWith(expect.objectContaining({ businessId: "biz_1", actorId: "user_1" }));
  });

  it("records explicit contribution actions and audits them", async () => {
    const { POST } = await import("@/app/api/cooperatives/route");
    const response = await POST(
      new Request("http://localhost/api/cooperatives", {
        method: "POST",
        body: JSON.stringify({
          action: "record_contribution",
          businessId: "biz_1",
          groupId: "group_1",
          memberId: "member_1",
          amount: 10000,
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.result.id).toBe("contribution_1");
    expect(requireCooperativesAccess).toHaveBeenCalledWith({
      userId: "user_1",
      businessId: "biz_1",
      permission: "cooperatives:record_contributions",
    });
    expect(recordContribution).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        actorId: "user_1",
        groupId: "group_1",
        memberId: "member_1",
        amount: 10000,
      }),
    );
    expect(createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: "biz_1",
          action: "cooperatives.contribution_recorded",
        }),
      }),
    );
  });

  it("creates loan requests without calling the repayment workflow", async () => {
    const { POST } = await import("@/app/api/cooperatives/route");
    const response = await POST(
      new Request("http://localhost/api/cooperatives", {
        method: "POST",
        body: JSON.stringify({
          action: "request_loan",
          businessId: "biz_1",
          groupId: "group_1",
          memberId: "member_1",
          principal: 20000,
          guarantorMemberIds: ["member_2"],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(requestLoan).toHaveBeenCalledWith(
      expect.objectContaining({
        principal: 20000,
        guarantorMemberIds: ["member_2"],
      }),
    );
    expect(recordRepayment).not.toHaveBeenCalled();
  });

  it("rejects unsupported write methods", async () => {
    const { PUT, PATCH, DELETE } = await import("@/app/api/cooperatives/route");

    expect(PUT().status).toBe(405);
    expect(PATCH().status).toBe(405);
    expect(DELETE().status).toBe(405);
  });
});
