import type { BillingFeature } from "@/lib/billing/plans";
import type { MoneybookState } from "@/lib/bookkeeping/transaction-engine";
import { phase2FeatureFlags, type Phase2Feature } from "@/lib/phase2/feature-flags";

type PermissionKey = keyof NonNullable<MoneybookState["permissions"]>;

export function hasEntitlement(state: MoneybookState, entitlement: BillingFeature) {
  return Boolean(state.billing?.features.includes(entitlement));
}

export function canShowPhase2Navigation({
  state,
  flag,
  entitlement,
  permission,
}: {
  state: MoneybookState;
  flag: Phase2Feature;
  entitlement: BillingFeature;
  permission?: PermissionKey;
}) {
  return Boolean(
    phase2FeatureFlags[flag] &&
      hasEntitlement(state, entitlement) &&
      (!permission || state.permissions?.[permission]),
  );
}
