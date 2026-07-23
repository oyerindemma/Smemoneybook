import { Role } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  requireStaffPerformanceAccess,
  StaffPerformanceAccessError,
} from "@/lib/staff-performance/authorization";

const mocks = vi.hoisted(() => ({
  getActiveBillingPlan: vi.fn(),
  businessMemberFindFirst: vi.fn(),
  businessLocationFindFirst: vi.fn(),
  businessLocationMemberFindFirst: vi.fn(),
  permissionPolicyFindUnique: vi.fn(),
  permissionOverrideFindMany: vi.fn(),
}));
const originalEnv = { ...process.env };

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

describe("staff performance authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PHASE3_STAFF_PERFORMANCE_ENABLED = "true";
    process.env.PHASE3_STAFF_PERFORMANCE_ENABLED = "true";
    process.env.PHASE3_AI_GLOBAL_KILL_SWITCH = "false";
    mocks.getActiveBillingPlan.mockResolvedValue({
      id: "pro",
      features: ["advanced_reports", "granular_permissions", "audit_tools"],
    });
    mocks.businessMemberFindFirst.mockResolvedValue(member(Role.OWNER));
    mocks.businessLocationFindFirst.mockResolvedValue({ id: "loc_1", name: "Main shop" });
    mocks.businessLocationMemberFindFirst.mockResolvedValue({ id: "loc_member_1" });
    mocks.permissionPolicyFindUnique.mockResolvedValue(null);
    mocks.permissionOverrideFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("requires both public and server feature flags", async () => {
    process.env.PHASE3_STAFF_PERFORMANCE_ENABLED = "false";

    await expect(
      requireStaffPerformanceAccess({
        userId: "owner_1",
        businessId: "biz_1",
        permission: "staff_performance:read",
      }),
    ).rejects.toMatchObject({
      status: 503,
      code: "feature_disabled",
    });
  });

  it("allows an owner to read and export by default", async () => {
    const access = await requireStaffPerformanceAccess({
      userId: "owner_1",
      businessId: "biz_1",
      permission: "staff_performance:export",
    });

    expect(access.businessId).toBe("biz_1");
    expect(mocks.permissionPolicyFindUnique).not.toHaveBeenCalled();
  });

  it("allows a manager-style staff member when explicitly granted by policy", async () => {
    mocks.businessMemberFindFirst.mockResolvedValue(member(Role.STAFF));
    mocks.permissionPolicyFindUnique.mockResolvedValue({
      permissions: ["staff_performance:read"],
    });

    const access = await requireStaffPerformanceAccess({
      userId: "manager_1",
      businessId: "biz_1",
      permission: "staff_performance:read",
    });

    expect(access.role).toBe(Role.STAFF);
  });

  it("rejects normal staff without a grant", async () => {
    mocks.businessMemberFindFirst.mockResolvedValue(member(Role.STAFF));

    await expect(
      requireStaffPerformanceAccess({
        userId: "staff_1",
        businessId: "biz_1",
        permission: "staff_performance:read",
      }),
    ).rejects.toBeInstanceOf(StaffPerformanceAccessError);
  });

  it("requires export permission separately", async () => {
    mocks.businessMemberFindFirst.mockResolvedValue(member(Role.ACCOUNTANT));
    mocks.permissionPolicyFindUnique.mockResolvedValue({
      permissions: ["staff_performance:read"],
    });

    await expect(
      requireStaffPerformanceAccess({
        userId: "accountant_1",
        businessId: "biz_1",
        permission: "staff_performance:export",
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: "permission_denied",
    });
  });

  it("validates selected locations for non-owner users", async () => {
    mocks.businessMemberFindFirst.mockResolvedValue(member(Role.STAFF));
    mocks.permissionOverrideFindMany.mockResolvedValue([
      {
        locationId: "loc_1",
        permissions: ["staff_performance:read"],
      },
    ]);

    const access = await requireStaffPerformanceAccess({
      userId: "manager_1",
      businessId: "biz_1",
      locationId: "loc_1",
      permission: "staff_performance:read",
    });

    expect(access.locationId).toBe("loc_1");
  });
});

function member(role: Role) {
  return {
    id: "member_1",
    role,
    userId: "user_1",
    businessId: "biz_1",
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    business: {
      id: "biz_1",
      name: "Demo Shop",
      currency: "NGN",
    },
  };
}
