import { redirect } from "next/navigation";
import type { BillingFeature, BillingPlanId } from "@/lib/billing/plans";
import { getActiveBillingPlan } from "@/lib/billing/subscriptions";
import { requireUser } from "@/lib/auth/session";
import {
  getBusinessAccess,
  hasPermission,
  type BusinessAccess,
  type Permission,
} from "@/lib/operations/access";
import { phase2FeatureFlags, type Phase2Feature } from "@/lib/phase2/feature-flags";

export type Phase2PageAccess =
  | {
      allowed: true;
      access: BusinessAccess;
    }
  | {
      allowed: false;
      title: string;
      description: string;
      billingLink?: boolean;
    };

export async function getPhase2PageAccess({
  routePath,
  feature,
  featureLabel,
  entitlement,
  requiredPlan,
  permission,
}: {
  routePath: string;
  feature: Phase2Feature;
  featureLabel: string;
  entitlement: BillingFeature;
  requiredPlan: BillingPlanId;
  permission: Permission;
}): Promise<Phase2PageAccess> {
  const user = await requireUser().catch((error: unknown) => {
    if (error instanceof Response && error.status === 401) {
      redirect(`/?next=${encodeURIComponent(routePath)}`);
    }

    throw error;
  });

  if (!phase2FeatureFlags[feature]) {
    return {
      allowed: false,
      title: `${featureLabel} are not available`,
      description: `${featureLabel} are not enabled for this Preview build yet.`,
      billingLink: false,
    };
  }

  const access = await getBusinessAccess(user.id);

  if (!access) {
    return {
      allowed: false,
      title: "Business access is required",
      description: "Create or select a business before using this Preview module.",
      billingLink: false,
    };
  }

  if (!hasPermission(access.role, "admin") && !hasPermission(access.role, permission)) {
    return {
      allowed: false,
      title: `${featureLabel} need more access`,
      description: "Ask the business owner to grant the required module permission.",
      billingLink: false,
    };
  }

  const plan = await getActiveBillingPlan(user.id, access.businessId);

  if (plan?.id !== requiredPlan || !plan.features.includes(entitlement)) {
    return {
      allowed: false,
      title: `Upgrade to use ${featureLabel.toLowerCase()}`,
      description: `This business needs the Professional plan with the ${entitlement.replaceAll("_", " ")} entitlement.`,
      billingLink: true,
    };
  }

  return {
    allowed: true,
    access,
  };
}
