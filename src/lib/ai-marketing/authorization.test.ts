import { Role } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveBillingPlan: vi.fn(),
  hasPermission: vi.fn(),
  businessMemberFindFirst: vi.fn(),
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
    permissionPolicy: { findUnique: mocks.permissionPolicyFindUnique },
    permissionOverride: { findMany: mocks.permissionOverrideFindMany },
  }),
}));

const originalEnv = { ...process.env };

async function loadAuthorization() {
  vi.resetModules();
  return import("@/lib/ai-marketing/authorization");
}

describe("AI Marketing authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PHASE3_AI_MARKETING_ENABLED = "true";
    process.env.PHASE3_AI_MARKETING_ENABLED = "true";
    process.env.PHASE3_AI_GLOBAL_KILL_SWITCH = "false";
    mocks.getActiveBillingPlan.mockResolvedValue({ id: "pro", features: ["ai_marketing"] });
    mocks.hasPermission.mockImplementation((role: Role, permission: string) => {
      return role === Role.OWNER && permission.startsWith("ai_marketing:");
    });
    mocks.businessMemberFindFirst.mockResolvedValue(membership(Role.OWNER));
    mocks.permissionPolicyFindUnique.mockResolvedValue(null);
    mocks.permissionOverrideFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("requires both public and server feature flags", async () => {
    process.env.PHASE3_AI_MARKETING_ENABLED = "false";
    const { isAiMarketingFeatureEnabledForServer, requireAiMarketingAccess } = await loadAuthorization();

    expect(isAiMarketingFeatureEnabledForServer()).toBe(false);
    await expect(
      requireAiMarketingAccess({
        userId: "owner_1",
        businessId: "biz_1",
        permission: "ai_marketing:read",
      }),
    ).rejects.toMatchObject({ status: 503, code: "feature_disabled" });
  });

  it("allows owners with the ai_marketing entitlement", async () => {
    const { requireAiMarketingAccess } = await loadAuthorization();

    await expect(
      requireAiMarketingAccess({
        userId: "owner_1",
        businessId: "biz_1",
        permission: "ai_marketing:send",
      }),
    ).resolves.toMatchObject({
      businessId: "biz_1",
      canRead: true,
      canCreate: true,
      canApprove: true,
      canSend: true,
      canExport: true,
      canManageConsent: true,
    });
  });

  it("rejects users outside the business", async () => {
    mocks.businessMemberFindFirst.mockResolvedValueOnce(null);
    const { requireAiMarketingAccess } = await loadAuthorization();

    await expect(
      requireAiMarketingAccess({
        userId: "user_1",
        businessId: "other_biz",
        permission: "ai_marketing:read",
      }),
    ).rejects.toMatchObject({ status: 403, code: "business_access_denied" });
  });

  it("requires the ai_marketing billing feature", async () => {
    mocks.getActiveBillingPlan.mockResolvedValueOnce({ id: "basic", features: ["basic_exports"] });
    const { requireAiMarketingAccess } = await loadAuthorization();

    await expect(
      requireAiMarketingAccess({
        userId: "owner_1",
        businessId: "biz_1",
        permission: "ai_marketing:read",
      }),
    ).rejects.toMatchObject({ status: 402, code: "upgrade_required" });
  });

  it("does not grant accountants or staff access by default", async () => {
    mocks.hasPermission.mockReturnValue(false);
    mocks.businessMemberFindFirst.mockResolvedValueOnce(membership(Role.ACCOUNTANT));
    const { requireAiMarketingAccess } = await loadAuthorization();

    await expect(
      requireAiMarketingAccess({
        userId: "acct_1",
        businessId: "biz_1",
        permission: "ai_marketing:read",
      }),
    ).rejects.toMatchObject({ status: 403, code: "permission_denied" });

    mocks.businessMemberFindFirst.mockResolvedValueOnce(membership(Role.STAFF));
    await expect(
      requireAiMarketingAccess({
        userId: "staff_1",
        businessId: "biz_1",
        permission: "ai_marketing:create",
      }),
    ).rejects.toMatchObject({ status: 403, code: "permission_denied" });
  });

  it("allows explicitly granted manager-style access by policy", async () => {
    mocks.hasPermission.mockReturnValue(false);
    mocks.businessMemberFindFirst.mockResolvedValueOnce(membership(Role.STAFF));
    mocks.permissionPolicyFindUnique.mockResolvedValue({
      permissions: ["ai_marketing:read", "ai_marketing:create"],
    });
    const { requireAiMarketingAccess } = await loadAuthorization();

    await expect(
      requireAiMarketingAccess({
        userId: "manager_1",
        businessId: "biz_1",
        permission: "ai_marketing:create",
      }),
    ).resolves.toMatchObject({
      role: Role.STAFF,
      canCreate: true,
      canApprove: false,
      canSend: false,
    });
  });
});

function membership(role: Role) {
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
