import { Role } from "@prisma/client";
import { getActiveBillingPlan } from "@/lib/billing/subscriptions";
import { hasPermission } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";
import type { PredictiveAlertPermission } from "@/lib/predictive-alerts/definitions";

export type PredictiveAlertsAccess = {
  businessId: string;
  businessName: string;
  currency: string;
  userId: string;
  role: Role;
  locationId?: string;
  locationName?: string;
  canManage: boolean;
  canAcknowledge: boolean;
  canExport: boolean;
};

export class PredictiveAlertsAccessError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "PredictiveAlertsAccessError";
    this.status = status;
    this.code = code;
  }
}

export function isPredictiveAlertsFeatureEnabledForServer() {
  return (
    !readFlag(process.env.PHASE3_AI_GLOBAL_KILL_SWITCH, false) &&
    readFlag(process.env.NEXT_PUBLIC_PHASE3_PREDICTIVE_ALERTS_ENABLED, false) &&
    readFlag(process.env.PHASE3_PREDICTIVE_ALERTS_ENABLED, false)
  );
}

export function predictiveAlertsFeatureUnavailableError() {
  return new PredictiveAlertsAccessError(
    "Predictive Alerts are unavailable in this environment.",
    503,
    "feature_disabled",
  );
}

export async function requirePredictiveAlertsAccess({
  userId,
  businessId,
  permission,
  locationId,
}: {
  userId: string;
  businessId: string;
  permission: PredictiveAlertPermission;
  locationId?: string;
}): Promise<PredictiveAlertsAccess> {
  if (!isPredictiveAlertsFeatureEnabledForServer()) {
    throw predictiveAlertsFeatureUnavailableError();
  }

  if (!businessId) {
    throw new PredictiveAlertsAccessError("Choose a business before opening Predictive Alerts.", 400, "business_required");
  }

  const prisma = getPrisma();
  const membership = await prisma.businessMember.findFirst({
    where: { userId, businessId },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          currency: true,
        },
      },
    },
  });

  if (!membership) {
    throw new PredictiveAlertsAccessError("You do not have access to this business.", 403, "business_access_denied");
  }

  const plan = await getActiveBillingPlan(userId, membership.businessId);

  if (!plan || plan.id !== "pro" || !plan.features.includes("predictive_alerts")) {
    throw new PredictiveAlertsAccessError("Upgrade to Pro to use Predictive Alerts.", 402, "upgrade_required");
  }

  const permissionGrant = await getPredictiveAlertsPermissionGrant({
    businessId: membership.businessId,
    userId,
    role: membership.role,
    permission,
    locationId,
  });

  if (!permissionGrant.allowed) {
    throw new PredictiveAlertsAccessError(permissionGrant.reason, 403, "permission_denied");
  }

  const [manageGrant, acknowledgeGrant, exportGrant, location] = await Promise.all([
    getPredictiveAlertsPermissionGrant({
      businessId: membership.businessId,
      userId,
      role: membership.role,
      permission: "predictive_alerts:manage",
      locationId,
    }),
    getPredictiveAlertsPermissionGrant({
      businessId: membership.businessId,
      userId,
      role: membership.role,
      permission: "predictive_alerts:acknowledge",
      locationId,
    }),
    getPredictiveAlertsPermissionGrant({
      businessId: membership.businessId,
      userId,
      role: membership.role,
      permission: "predictive_alerts:export",
      locationId,
    }),
    locationId
      ? prisma.businessLocation.findFirst({
          where: {
            id: locationId,
            businessId: membership.businessId,
            archivedAt: null,
          },
          select: {
            id: true,
            name: true,
          },
        })
      : Promise.resolve(null),
  ]);

  if (locationId && !location) {
    throw new PredictiveAlertsAccessError("Choose a valid business location.", 400, "location_invalid");
  }

  if (location && membership.role !== Role.OWNER && !permissionGrant.businessWide) {
    const locationMembership = await prisma.businessLocationMember.findFirst({
      where: {
        businessId: membership.businessId,
        locationId: location.id,
        userId,
      },
      select: { id: true },
    });

    if (!locationMembership && !permissionGrant.locationScoped) {
      throw new PredictiveAlertsAccessError(
        "You do not have access to this location.",
        403,
        "location_access_denied",
      );
    }
  }

  return {
    businessId: membership.business.id,
    businessName: membership.business.name,
    currency: membership.business.currency,
    userId,
    role: membership.role,
    locationId: location?.id,
    locationName: location?.name,
    canManage: manageGrant.allowed,
    canAcknowledge: acknowledgeGrant.allowed,
    canExport: exportGrant.allowed,
  };
}

async function getPredictiveAlertsPermissionGrant({
  businessId,
  userId,
  role,
  permission,
  locationId,
}: {
  businessId: string;
  userId: string;
  role: Role;
  permission: PredictiveAlertPermission;
  locationId?: string;
}) {
  if (hasPermission(role, permission)) {
    return { allowed: true, businessWide: true, locationScoped: false, reason: "" };
  }

  const prisma = getPrisma();
  const [policy, overrides] = await Promise.all([
    prisma.permissionPolicy.findUnique({
      where: { businessId_role: { businessId, role } },
      select: { permissions: true },
    }),
    prisma.permissionOverride.findMany({
      where: {
        businessId,
        userId,
        OR: locationId ? [{ locationId: null }, { locationId }] : undefined,
      },
      select: {
        locationId: true,
        permissions: true,
      },
    }),
  ]);

  if (policy?.permissions.includes(permission)) {
    return { allowed: true, businessWide: true, locationScoped: false, reason: "" };
  }

  const businessOverride = overrides.find(
    (override) => override.locationId === null && override.permissions.includes(permission),
  );

  if (businessOverride) {
    return { allowed: true, businessWide: true, locationScoped: false, reason: "" };
  }

  const locationOverride = overrides.find(
    (override) => override.locationId && override.permissions.includes(permission),
  );

  if (locationOverride) {
    return { allowed: true, businessWide: false, locationScoped: true, reason: "" };
  }

  return {
    allowed: false,
    businessWide: false,
    locationScoped: false,
    reason: permissionDeniedMessage(permission),
  };
}

function permissionDeniedMessage(permission: PredictiveAlertPermission) {
  if (permission === "predictive_alerts:manage") {
    return "You do not have permission to manage Predictive Alerts.";
  }

  if (permission === "predictive_alerts:acknowledge") {
    return "You do not have permission to update Predictive Alerts.";
  }

  if (permission === "predictive_alerts:export") {
    return "You do not have permission to export Predictive Alerts.";
  }

  return "You do not have permission to view Predictive Alerts.";
}

function readFlag(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
