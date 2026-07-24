import { Role } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveBillingPlan: vi.fn(),
  hasPermission: vi.fn(),
  businessMemberFindFirst: vi.fn(),
  businessFindUnique: vi.fn(),
  permissionPolicyFindUnique: vi.fn(),
  permissionOverrideFindMany: vi.fn(),
}));

vi.mock("@/lib/billing/subscriptions", () => ({
  getActiveBillingPlan: mocks.getActiveBillingPlan,
}));

vi.mock("@/lib/operations/access", () => ({
  hasPermission: mocks.hasPermission,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    businessMember: { findFirst: mocks.businessMemberFindFirst },
    business: { findUnique: mocks.businessFindUnique },
    permissionPolicy: { findUnique: mocks.permissionPolicyFindUnique },
    permissionOverride: { findMany: mocks.permissionOverrideFindMany },
  }),
}));

const originalEnv = { ...process.env };

async function loadAuthorization() {
  vi.resetModules();
  return import("@/lib/ai-evaluation/authorization");
}

describe("AI Evaluation authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PHASE3_AI_EVALUATION_ENABLED = "true";
    process.env.PHASE3_AI_EVALUATION_ENABLED = "true";
    process.env.PHASE3_AI_GLOBAL_KILL_SWITCH = "false";
    process.env.ADMIN_EMAILS = "internal@example.com";
    mocks.getActiveBillingPlan.mockResolvedValue({ id: "pro", features: ["ai_evaluation"] });
    mocks.hasPermission.mockImplementation((role: Role, permission: string) => {
      return role === Role.OWNER && permission.startsWith("ai_evaluation:");
    });
    mocks.businessMemberFindFirst.mockResolvedValue(ownerMembership());
    mocks.businessFindUnique.mockResolvedValue({ id: "biz_1", name: "Preview Shop", currency: "NGN" });
    mocks.permissionPolicyFindUnique.mockResolvedValue(null);
    mocks.permissionOverrideFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("requires both public and server flags", async () => {
    process.env.PHASE3_AI_EVALUATION_ENABLED = "false";
    const { isAiEvaluationFeatureEnabledForServer } = await loadAuthorization();

    expect(isAiEvaluationFeatureEnabledForServer()).toBe(false);
  });

  it("allows owner-admin workspaces with Pro entitlement", async () => {
    const { requireAiEvaluationAccess } = await loadAuthorization();

    await expect(
      requireAiEvaluationAccess({
        user: { id: "owner_1", email: "owner@example.com" },
        businessId: "biz_1",
        permission: "ai_evaluation:run",
      }),
    ).resolves.toMatchObject({
      businessId: "biz_1",
      canRun: true,
      canManageCases: true,
      canExport: true,
      canCompareModels: true,
    });
  });

  it("rejects users outside the business", async () => {
    mocks.businessMemberFindFirst.mockResolvedValueOnce(null);
    const { requireAiEvaluationAccess } = await loadAuthorization();

    await expect(
      requireAiEvaluationAccess({
        user: { id: "user_1", email: "user@example.com" },
        businessId: "other_biz",
        permission: "ai_evaluation:read",
      }),
    ).rejects.toMatchObject({ status: 403, code: "business_access_denied" });
  });

  it("rejects missing ai_evaluation entitlement", async () => {
    mocks.getActiveBillingPlan.mockResolvedValueOnce({ id: "pro", features: ["advanced_reports"] });
    const { requireAiEvaluationAccess } = await loadAuthorization();

    await expect(
      requireAiEvaluationAccess({
        user: { id: "owner_1", email: "owner@example.com" },
        businessId: "biz_1",
        permission: "ai_evaluation:read",
      }),
    ).rejects.toMatchObject({ status: 402, code: "upgrade_required" });
  });

  it("does not grant accountants or staff access by default", async () => {
    mocks.hasPermission.mockReturnValue(false);
    mocks.businessMemberFindFirst.mockResolvedValueOnce(ownerMembership(Role.ACCOUNTANT));
    const { requireAiEvaluationAccess } = await loadAuthorization();

    await expect(
      requireAiEvaluationAccess({
        user: { id: "acct_1", email: "acct@example.com" },
        businessId: "biz_1",
        permission: "ai_evaluation:read",
      }),
    ).rejects.toMatchObject({ status: 403, code: "permission_denied" });

    mocks.businessMemberFindFirst.mockResolvedValueOnce(ownerMembership(Role.STAFF));
    await expect(
      requireAiEvaluationAccess({
        user: { id: "staff_1", email: "staff@example.com" },
        businessId: "biz_1",
        permission: "ai_evaluation:read",
      }),
    ).rejects.toMatchObject({ status: 403, code: "permission_denied" });
  });

  it("allows configured internal admins without exposing environment values", async () => {
    mocks.businessMemberFindFirst.mockResolvedValueOnce(null);
    const { requireAiEvaluationAccess } = await loadAuthorization();

    await expect(
      requireAiEvaluationAccess({
        user: { id: "admin_1", email: "internal@example.com" },
        businessId: "biz_1",
        permission: "ai_evaluation:compare_models",
      }),
    ).resolves.toMatchObject({
      businessId: "biz_1",
      role: "INTERNAL_ADMIN",
      canCompareModels: true,
    });
    expect(mocks.getActiveBillingPlan).not.toHaveBeenCalled();
  });
});

function ownerMembership(role: Role = Role.OWNER) {
  return {
    userId: "owner_1",
    businessId: "biz_1",
    role,
    business: {
      id: "biz_1",
      name: "Preview Shop",
      currency: "NGN",
    },
  };
}
