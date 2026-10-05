import { Role } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BankReconciliationAccessError,
  requireBankReconciliationAccess,
} from "@/lib/bank-reconciliation/authorization";

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

describe("bank reconciliation authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PHASE3_BANK_RECONCILIATION_ENABLED = "true";
    process.env.PHASE3_BANK_RECONCILIATION_ENABLED = "true";
    process.env.PHASE3_AI_GLOBAL_KILL_SWITCH = "false";
    mocks.getActiveBillingPlan.mockResolvedValue({
      id: "growth",
      features: ["bank_reconciliation"],
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
    process.env.PHASE3_BANK_RECONCILIATION_ENABLED = "false";

    await expect(
      requireBankReconciliationAccess({
        userId: "owner_1",
        businessId: "biz_1",
        permission: "bank_reconciliation:read",
      }),
    ).rejects.toMatchObject({
      status: 503,
      code: "feature_disabled",
    });
  });

  it("allows an owner to import, review, and export by default", async () => {
    const access = await requireBankReconciliationAccess({
      userId: "owner_1",
      businessId: "biz_1",
      permission: "bank_reconciliation:export",
    });

    expect(access.businessId).toBe("biz_1");
    expect(mocks.permissionPolicyFindUnique).not.toHaveBeenCalled();
  });

  it("allows an accountant through default reconciliation permissions", async () => {
    mocks.businessMemberFindFirst.mockResolvedValue(member(Role.ACCOUNTANT));

    const access = await requireBankReconciliationAccess({
      userId: "accountant_1",
      businessId: "biz_1",
      permission: "bank_reconciliation:match",
    });

    expect(access.role).toBe(Role.ACCOUNTANT);
  });

  it("rejects normal staff without an explicit grant", async () => {
    mocks.businessMemberFindFirst.mockResolvedValue(member(Role.STAFF));

    await expect(
      requireBankReconciliationAccess({
        userId: "staff_1",
        businessId: "biz_1",
        permission: "bank_reconciliation:read",
      }),
    ).rejects.toBeInstanceOf(BankReconciliationAccessError);
  });

  it("allows a staff user with a location-scoped override", async () => {
    mocks.businessMemberFindFirst.mockResolvedValue(member(Role.STAFF));
    mocks.permissionOverrideFindMany.mockResolvedValue([
      {
        locationId: "loc_1",
        permissions: ["bank_reconciliation:read"],
      },
    ]);

    const access = await requireBankReconciliationAccess({
      userId: "manager_1",
      businessId: "biz_1",
      locationId: "loc_1",
      permission: "bank_reconciliation:read",
    });

    expect(access.locationId).toBe("loc_1");
  });

  it("requires the bank_reconciliation billing entitlement", async () => {
    mocks.getActiveBillingPlan.mockResolvedValue({
      id: "growth",
      features: ["receipt_extraction"],
    });

    await expect(
      requireBankReconciliationAccess({
        userId: "owner_1",
        businessId: "biz_1",
        permission: "bank_reconciliation:read",
      }),
    ).rejects.toMatchObject({
      status: 402,
      code: "upgrade_required",
    });
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
