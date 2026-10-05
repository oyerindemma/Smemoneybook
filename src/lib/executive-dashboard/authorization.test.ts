import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  getActiveBillingPlan: vi.fn(),
  businessMemberFindFirst: vi.fn(),
  businessLocationFindFirst: vi.fn(),
  businessLocationMemberFindFirst: vi.fn(),
  permissionPolicyFindUnique: vi.fn(),
  permissionOverrideFindMany: vi.fn(),
}));

vi.mock("@/lib/billing/subscriptions", () => ({
  getActiveBillingPlan: mocks.getActiveBillingPlan,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    businessMember: { findFirst: mocks.businessMemberFindFirst },
    businessLocation: { findFirst: mocks.businessLocationFindFirst },
    businessLocationMember: { findFirst: mocks.businessLocationMemberFindFirst },
    permissionPolicy: { findUnique: mocks.permissionPolicyFindUnique },
    permissionOverride: { findMany: mocks.permissionOverrideFindMany },
  }),
}));

const originalEnv = { ...process.env };

async function loadAuthorization() {
  vi.resetModules();
  return import("@/lib/executive-dashboard/authorization");
}

describe("Executive Dashboard authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PHASE3_EXECUTIVE_DASHBOARD_ENABLED = "true";
    process.env.PHASE3_EXECUTIVE_DASHBOARD_ENABLED = "true";
    process.env.PHASE3_AI_GLOBAL_KILL_SWITCH = "false";
    mocks.getActiveBillingPlan.mockResolvedValue({ id: "pro", features: ["executive_dashboard"] });
    mocks.businessMemberFindFirst.mockResolvedValue({
      userId: "user_1",
      businessId: "biz_1",
      role: Role.OWNER,
      business: {
        id: "biz_1",
        name: "Preview Shop",
        currency: "NGN",
      },
    });
    mocks.businessLocationFindFirst.mockResolvedValue(null);
    mocks.businessLocationMemberFindFirst.mockResolvedValue(null);
    mocks.permissionPolicyFindUnique.mockResolvedValue(null);
    mocks.permissionOverrideFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("requires both server and client flags", async () => {
    process.env.PHASE3_EXECUTIVE_DASHBOARD_ENABLED = "false";
    const { isExecutiveDashboardFeatureEnabledForServer } = await loadAuthorization();

    expect(isExecutiveDashboardFeatureEnabledForServer()).toBe(false);
  });

  it("allows owners with Pro entitlement", async () => {
    const { requireExecutiveDashboardAccess } = await loadAuthorization();

    await expect(
      requireExecutiveDashboardAccess({
        userId: "user_1",
        businessId: "biz_1",
        permission: "executive_dashboard:read",
      }),
    ).resolves.toMatchObject({
      businessId: "biz_1",
      canViewSensitive: true,
      canViewStaffSummary: true,
    });
  });

  it("rejects users outside the business", async () => {
    mocks.businessMemberFindFirst.mockResolvedValueOnce(null);
    const { requireExecutiveDashboardAccess } = await loadAuthorization();

    await expect(
      requireExecutiveDashboardAccess({
        userId: "user_1",
        businessId: "other_biz",
        permission: "executive_dashboard:read",
      }),
    ).rejects.toMatchObject({ status: 403, code: "business_access_denied" });
  });

  it("requires executive_dashboard entitlement", async () => {
    mocks.getActiveBillingPlan.mockResolvedValueOnce({ id: "growth", features: ["bank_reconciliation"] });
    const { requireExecutiveDashboardAccess } = await loadAuthorization();

    await expect(
      requireExecutiveDashboardAccess({
        userId: "user_1",
        businessId: "biz_1",
        permission: "executive_dashboard:read",
      }),
    ).rejects.toMatchObject({ status: 402, code: "upgrade_required" });
  });

  it("does not grant staff access by default", async () => {
    mocks.businessMemberFindFirst.mockResolvedValueOnce({
      userId: "staff_1",
      businessId: "biz_1",
      role: Role.STAFF,
      business: {
        id: "biz_1",
        name: "Preview Shop",
        currency: "NGN",
      },
    });
    const { requireExecutiveDashboardAccess } = await loadAuthorization();

    await expect(
      requireExecutiveDashboardAccess({
        userId: "staff_1",
        businessId: "biz_1",
        permission: "executive_dashboard:read",
      }),
    ).rejects.toMatchObject({ status: 403, code: "permission_denied" });
  });
});
