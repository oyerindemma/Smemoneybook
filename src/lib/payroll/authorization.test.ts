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
  return import("@/lib/payroll/authorization");
}

describe("Phase 3I Payroll authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PHASE3_PAYROLL_ENABLED = "true";
    process.env.PHASE3_PAYROLL_ENABLED = "true";
    process.env.PHASE3_AI_GLOBAL_KILL_SWITCH = "false";
    mocks.getActiveBillingPlan.mockResolvedValue({ id: "pro", features: ["payroll"] });
    mocks.hasPermission.mockImplementation((role: Role, permission: string) => {
      return role === Role.OWNER && permission.startsWith("payroll:");
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
    process.env.PHASE3_PAYROLL_ENABLED = "false";
    const { isPayrollFeatureEnabledForServer, requirePayrollAccess } = await loadAuthorization();

    expect(isPayrollFeatureEnabledForServer()).toBe(false);
    await expect(
      requirePayrollAccess({
        userId: "owner_1",
        businessId: "biz_1",
        permission: "payroll:read",
      }),
    ).rejects.toMatchObject({ status: 503, code: "feature_disabled" });
  });

  it("allows owners with the payroll entitlement", async () => {
    const { requirePayrollAccess } = await loadAuthorization();

    await expect(
      requirePayrollAccess({
        userId: "owner_1",
        businessId: "biz_1",
        permission: "payroll:approve",
      }),
    ).resolves.toMatchObject({
      businessId: "biz_1",
      canRead: true,
      canManageEmployees: true,
      canPrepare: true,
      canApprove: true,
      canPostExpense: true,
      canViewSensitive: true,
    });
  });

  it("requires business isolation and the payroll billing feature", async () => {
    const { requirePayrollAccess } = await loadAuthorization();
    mocks.businessMemberFindFirst.mockResolvedValueOnce(null);

    await expect(
      requirePayrollAccess({
        userId: "owner_1",
        businessId: "other_biz",
        permission: "payroll:read",
      }),
    ).rejects.toMatchObject({ status: 403, code: "business_access_denied" });

    mocks.businessMemberFindFirst.mockResolvedValueOnce(membership(Role.OWNER));
    mocks.getActiveBillingPlan.mockResolvedValueOnce({ id: "growth", features: ["basic_exports"] });
    await expect(
      requirePayrollAccess({
        userId: "owner_1",
        businessId: "biz_1",
        permission: "payroll:read",
      }),
    ).rejects.toMatchObject({ status: 402, code: "upgrade_required" });
  });

  it("allows explicitly granted payroll admin access by policy", async () => {
    mocks.hasPermission.mockReturnValue(false);
    mocks.businessMemberFindFirst.mockResolvedValueOnce(membership(Role.ACCOUNTANT));
    mocks.permissionPolicyFindUnique.mockResolvedValue({
      permissions: ["payroll:read", "payroll:review", "payroll:export", "payroll:post_expense"],
    });
    const { requirePayrollAccess } = await loadAuthorization();

    await expect(
      requirePayrollAccess({
        userId: "accountant_1",
        businessId: "biz_1",
        permission: "payroll:export",
      }),
    ).resolves.toMatchObject({
      role: Role.ACCOUNTANT,
      canReview: true,
      canExport: true,
      canPostExpense: true,
      canApprove: false,
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
