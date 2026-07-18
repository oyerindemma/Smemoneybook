import type { BillingFeature } from "@/lib/billing/plans";
import type { MoneybookState } from "@/lib/bookkeeping/transaction-engine";
import { phase2FeatureFlags, type Phase2Feature } from "@/lib/phase2/feature-flags";

type PermissionKey = keyof NonNullable<MoneybookState["permissions"]>;

export type Phase2NavigationAccess = {
  enabled: boolean;
  flagEnabled: boolean;
  entitled: boolean;
  permitted: boolean;
  reason: "available" | "flag-disabled" | "upgrade" | "permission";
};

export function hasEntitlement(state: MoneybookState, entitlement: BillingFeature) {
  return Boolean(state.billing?.features.includes(entitlement));
}

export function hasClientPermission(state: MoneybookState, permission?: PermissionKey) {
  if (!permission || state.businessRole === "owner") {
    return true;
  }

  return Boolean(state.permissions?.[permission]);
}

export function canShowBillingNavigation(state: MoneybookState) {
  return hasClientPermission(state, "canManageAccounts");
}

export function getPhase2NavigationAccess({
  state,
  flag,
  entitlement,
  permission,
}: {
  state: MoneybookState;
  flag: Phase2Feature;
  entitlement: BillingFeature;
  permission?: PermissionKey;
}): Phase2NavigationAccess {
  const flagEnabled = phase2FeatureFlags[flag];
  const entitled = hasEntitlement(state, entitlement);
  const permitted = hasClientPermission(state, permission);
  const enabled = Boolean(flagEnabled && entitled && permitted);
  const reason = enabled
    ? "available"
    : !flagEnabled
      ? "flag-disabled"
      : !entitled
        ? "upgrade"
        : "permission";

  return {
    enabled,
    flagEnabled,
    entitled,
    permitted,
    reason,
  };
}

export function canShowPhase2Navigation(input: {
  state: MoneybookState;
  flag: Phase2Feature;
  entitlement: BillingFeature;
  permission?: PermissionKey;
}) {
  return getPhase2NavigationAccess(input).enabled;
}
