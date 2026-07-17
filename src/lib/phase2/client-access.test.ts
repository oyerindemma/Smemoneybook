import { describe, expect, it } from "vitest";
import type { MoneybookState } from "@/lib/bookkeeping/transaction-engine";
import { canShowPhase2Navigation, hasEntitlement } from "@/lib/phase2/client-access";
import { phase2FeatureFlags } from "@/lib/phase2/feature-flags";

const state: MoneybookState = {
  businessId: "biz_1",
  businessName: "Demo Shop",
  businessRole: "owner",
  permissions: {
    canManageStaff: true,
    canManageAccounts: true,
    canSaveReports: true,
    canExportBackup: true,
    canViewLocations: true,
    canManageLocations: true,
    canViewTransfers: true,
    canManageTransfers: true,
    canApproveTransfers: true,
    canReceiveTransfers: true,
    canManageTax: true,
  },
  billing: {
    planId: "pro",
    planName: "Pro",
    features: ["multi_location", "warehouse_transfers", "advanced_reports"],
  },
  accounts: [],
  transactions: [],
  debts: [],
  items: [],
  auditLogs: [],
};

describe("Phase 2 client access", () => {
  it("requires a plan entitlement", () => {
    expect(hasEntitlement(state, "multi_location")).toBe(true);
    expect(hasEntitlement(state, "tax_management")).toBe(false);
  });

  it("matches the active rollout flag when entitlement and permission pass", () => {
    expect(
      canShowPhase2Navigation({
        state,
        flag: "locations",
        entitlement: "multi_location",
        permission: "canManageLocations",
      }),
    ).toBe(phase2FeatureFlags.locations);
  });
});
