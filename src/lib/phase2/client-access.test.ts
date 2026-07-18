import { describe, expect, it } from "vitest";
import type { MoneybookState } from "@/lib/bookkeeping/transaction-engine";
import {
  canShowBillingNavigation,
  canShowPhase2Navigation,
  getPhase2NavigationAccess,
  hasClientPermission,
  hasEntitlement,
} from "@/lib/phase2/client-access";
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

  it("reports why a module cannot be opened", () => {
    const access = getPhase2NavigationAccess({
      state,
      flag: "tax",
      entitlement: "tax_management",
      permission: "canManageTax",
    });

    expect(access.entitled).toBe(false);
    expect(access.reason).toBe(phase2FeatureFlags.tax ? "upgrade" : "flag-disabled");
  });

  it("treats owners as having module permissions even if the client permission payload is partial", () => {
    const ownerState = {
      ...state,
      permissions: undefined,
    };

    expect(hasClientPermission(ownerState, "canManageLocations")).toBe(true);
  });

  it("keeps billing visible for owners without a paid subscription", () => {
    const freeOwnerState: MoneybookState = {
      ...state,
      billing: {
        planId: "free",
        planName: "Free",
        features: [],
      },
    };

    expect(canShowBillingNavigation(freeOwnerState)).toBe(true);
  });
});
