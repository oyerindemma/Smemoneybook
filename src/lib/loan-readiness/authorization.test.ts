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

vi.mock("@/lib/billing/subscriptions", () => ({ getActiveBillingPlan: mocks.getActiveBillingPlan }));
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

describe("Loan Readiness authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PHASE3_AI_GLOBAL_KILL_SWITCH = "false";
    process.env.PHASE3_LOAN_READINESS_ENABLED = "true";
    process.env.NEXT_PUBLIC_PHASE3_LOAN_READINESS_ENABLED = "true";
    mocks.getActiveBillingPlan.mockResolvedValue({ id: "growth", features: ["loan_readiness"] });
    mocks.businessMemberFindFirst.mockResolvedValue({
      userId: "owner_1",
      businessId: "biz_1",
      role: Role.OWNER,
      business: { id: "biz_1", name: "Preview Shop", currency: "NGN" },
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

  it("requires both Loan Readiness flags and the global kill switch to be clear", async () => {
    process.env.PHASE3_LOAN_READINESS_ENABLED = "false";
    const { isLoanReadinessFeatureEnabledForServer } = await import("@/lib/loan-readiness/authorization");
    expect(isLoanReadinessFeatureEnabledForServer()).toBe(false);
  });

  it("allows owners all capabilities with the entitlement", async () => {
    const { requireLoanReadinessAccess } = await import("@/lib/loan-readiness/authorization");
    await expect(requireLoanReadinessAccess({
      userId: "owner_1",
      businessId: "biz_1",
      permission: "loan_readiness:read",
    })).resolves.toMatchObject({
      businessId: "biz_1",
      capabilities: { canRead: true, canGenerate: true, canExport: true, canManageProfile: true },
    });
  });

  it("gives accountants read, generate, and export but not profile management", async () => {
    mocks.businessMemberFindFirst.mockResolvedValueOnce({
      userId: "accountant_1",
      businessId: "biz_1",
      role: Role.ACCOUNTANT,
      business: { id: "biz_1", name: "Preview Shop", currency: "NGN" },
    });
    const { requireLoanReadinessAccess } = await import("@/lib/loan-readiness/authorization");
    await expect(requireLoanReadinessAccess({
      userId: "accountant_1",
      businessId: "biz_1",
      permission: "loan_readiness:read",
    })).resolves.toMatchObject({
      capabilities: { canRead: true, canGenerate: true, canExport: true, canManageProfile: false },
    });
  });

  it("rejects users outside the requested business", async () => {
    mocks.businessMemberFindFirst.mockResolvedValueOnce(null);
    const { requireLoanReadinessAccess } = await import("@/lib/loan-readiness/authorization");
    await expect(requireLoanReadinessAccess({
      userId: "user_1",
      businessId: "other_business",
      permission: "loan_readiness:read",
    })).rejects.toMatchObject({ status: 403, code: "business_access_denied" });
  });

  it("requires the loan_readiness billing entitlement", async () => {
    mocks.getActiveBillingPlan.mockResolvedValueOnce({ id: "growth", features: ["tax_assistant"] });
    const { requireLoanReadinessAccess } = await import("@/lib/loan-readiness/authorization");
    await expect(requireLoanReadinessAccess({
      userId: "owner_1",
      businessId: "biz_1",
      permission: "loan_readiness:read",
    })).rejects.toMatchObject({ status: 402, code: "upgrade_required" });
  });

  it("denies staff by default and accepts an explicit business policy", async () => {
    mocks.businessMemberFindFirst.mockResolvedValue({
      userId: "staff_1",
      businessId: "biz_1",
      role: Role.STAFF,
      business: { id: "biz_1", name: "Preview Shop", currency: "NGN" },
    });
    const { requireLoanReadinessAccess } = await import("@/lib/loan-readiness/authorization");
    await expect(requireLoanReadinessAccess({
      userId: "staff_1",
      businessId: "biz_1",
      permission: "loan_readiness:read",
    })).rejects.toMatchObject({ status: 403, code: "permission_denied" });

    mocks.permissionPolicyFindUnique.mockResolvedValue({ permissions: ["loan_readiness:read"] });
    await expect(requireLoanReadinessAccess({
      userId: "staff_1",
      businessId: "biz_1",
      permission: "loan_readiness:read",
    })).resolves.toMatchObject({ businessId: "biz_1" });
  });

  it("validates that a requested location belongs to the same business", async () => {
    mocks.businessLocationFindFirst.mockResolvedValueOnce(null);
    const { requireLoanReadinessAccess } = await import("@/lib/loan-readiness/authorization");
    await expect(requireLoanReadinessAccess({
      userId: "owner_1",
      businessId: "biz_1",
      locationId: "foreign_location",
      permission: "loan_readiness:read",
    })).rejects.toMatchObject({ status: 400, code: "location_invalid" });
  });
});
