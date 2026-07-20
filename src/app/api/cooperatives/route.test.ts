import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const enforceRateLimit = vi.fn();
const requireBusinessAccess = vi.fn();
const requireLocationAccess = vi.fn();
const requireMinimumPlan = vi.fn();
const listDashboard = vi.fn();
const createGroup = vi.fn();
const addMember = vi.fn();
const recordContribution = vi.fn();
const requestLoan = vi.fn();
const recordRepayment = vi.fn();
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

vi.mock("@/lib/phase3/cooperative-service", () => ({
  listCooperativeDashboard: listDashboard,
  createCooperativeGroup: createGroup,
  addCooperativeMember: addMember,
  recordCooperativeContribution: recordContribution,
  requestCooperativeLoan: requestLoan,
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
    process.env.NEXT_PUBLIC_PHASE3_COOPERATIVES_ENABLED = "true";
    requireUser.mockResolvedValue({ id: "user_1" });
    enforceRateLimit.mockResolvedValue(null);
    requireBusinessAccess.mockResolvedValue({ businessId: "biz_1" });
    requireLocationAccess.mockResolvedValue({ businessId: "biz_1", locationId: "loc_1" });
    requireMinimumPlan.mockResolvedValue(null);
    listDashboard.mockResolvedValue([{ id: "group_1", name: "Market Savings", summary: { groupCashBalance: 0 } }]);
    createGroup.mockResolvedValue({ id: "group_1", name: "Market Savings" });
    addMember.mockResolvedValue({ id: "member_1" });
    recordContribution.mockResolvedValue({ id: "contribution_1" });
    requestLoan.mockResolvedValue({ id: "loan_1" });
    recordRepayment.mockResolvedValue({ id: "repayment_1" });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("requires the Phase 3 cooperative flag", async () => {
    process.env.NEXT_PUBLIC_PHASE3_COOPERATIVES_ENABLED = "false";
    vi.resetModules();

    const { GET } = await import("@/app/api/cooperatives/route");
    const response = await GET(new Request("http://localhost/api/cooperatives?businessId=biz_1"));

    expect(response.status).toBe(404);
    expect(listDashboard).not.toHaveBeenCalled();
  });

  it("lists cooperative groups for an authorized Pro business", async () => {
    const { GET } = await import("@/app/api/cooperatives/route");
    const response = await GET(new Request("http://localhost/api/cooperatives?businessId=biz_1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.groups[0].id).toBe("group_1");
    expect(requireBusinessAccess).toHaveBeenCalledWith("user_1", "money:write", "biz_1");
    expect(requireMinimumPlan).toHaveBeenCalledWith(
      "user_1",
      "biz_1",
      "pro",
      "Upgrade to Pro to use cooperative and savings groups.",
    );
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
    expect(requireLocationAccess).toHaveBeenCalledWith({
      userId: "user_1",
      businessId: "biz_1",
      locationId: "loc_1",
      permission: "locations:view",
    });
    expect(createGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        actorId: "user_1",
        locationId: "loc_1",
        name: "Market Savings",
        contributionAmount: 5000,
      }),
    );
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
          action: "cooperatives.record_contribution",
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
});
