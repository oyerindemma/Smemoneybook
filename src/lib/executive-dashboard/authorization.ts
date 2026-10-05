import { Role } from "@prisma/client";
import { getActiveBillingPlan } from "@/lib/billing/subscriptions";
import { hasPermission } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";
import type { ExecutiveDashboardPermission } from "@/lib/executive-dashboard/definitions";

export type ExecutiveDashboardAccess = {
  businessId: string;
  businessName: string;
  currency: string;
  userId: string;
  role: Role;
  locationId?: string;
  locationName?: string;
  canViewSensitive: boolean;
  canViewStaffSummary: boolean;
};

export class ExecutiveDashboardAccessError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "ExecutiveDashboardAccessError";
    this.status = status;
    this.code = code;
  }
}

export function isExecutiveDashboardFeatureEnabledForServer() {
  return (
    !readFlag(process.env.PHASE3_AI_GLOBAL_KILL_SWITCH, false) &&
    readFlag(process.env.NEXT_PUBLIC_PHASE3_EXECUTIVE_DASHBOARD_ENABLED, false) &&
    readFlag(process.env.PHASE3_EXECUTIVE_DASHBOARD_ENABLED, false)
  );
}

export function executiveDashboardFeatureUnavailableError() {
  return new ExecutiveDashboardAccessError(
    "Executive Dashboard is unavailable in this environment.",
    503,
    "feature_disabled",
  );
}

export async function requireExecutiveDashboardAccess({
  userId,
  businessId,
  permission,
  locationId,
}: {
  userId: string;
  businessId: string;
  permission: ExecutiveDashboardPermission;
  locationId?: string;
}): Promise<ExecutiveDashboardAccess> {
  if (!isExecutiveDashboardFeatureEnabledForServer()) {
    throw executiveDashboardFeatureUnavailableError();
  }

  if (!businessId) {
    throw new ExecutiveDashboardAccessError(
      "Choose a business before opening Executive Dashboard.",
      400,
      "business_required",
    );
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
    throw new ExecutiveDashboardAccessError(
      "You do not have access to this business.",
      403,
      "business_access_denied",
    );
  }

  const plan = await getActiveBillingPlan(userId, membership.businessId);

  if (!plan || plan.id !== "pro" || !plan.features.includes("executive_dashboard")) {
    throw new ExecutiveDashboardAccessError(
      "Upgrade to Pro to use Executive Dashboard.",
      402,
      "upgrade_required",
    );
  }

  const permissionGrant = await getExecutiveDashboardPermissionGrant({
    businessId: membership.businessId,
    userId,
    role: membership.role,
    permission,
    locationId,
  });

  if (!permissionGrant.allowed) {
    throw new ExecutiveDashboardAccessError(permissionGrant.reason, 403, "permission_denied");
  }

  const [sensitiveGrant, staffGrant, location] = await Promise.all([
    getExecutiveDashboardPermissionGrant({
      businessId: membership.businessId,
      userId,
      role: membership.role,
      permission: "executive_dashboard:view_sensitive",
      locationId,
    }),
    getExecutiveDashboardPermissionGrant({
      businessId: membership.businessId,
      userId,
      role: membership.role,
      permission: "executive_dashboard:view_staff_summary",
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
    throw new ExecutiveDashboardAccessError("Choose a valid business location.", 400, "location_invalid");
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
      throw new ExecutiveDashboardAccessError(
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
    canViewSensitive: sensitiveGrant.allowed,
    canViewStaffSummary: staffGrant.allowed,
  };
}

async function getExecutiveDashboardPermissionGrant({
  businessId,
  userId,
  role,
  permission,
  locationId,
}: {
  businessId: string;
  userId: string;
  role: Role;
  permission: ExecutiveDashboardPermission;
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

  if (locationId) {
    const locationOverride = overrides.find(
      (override) => override.locationId === locationId && override.permissions.includes(permission),
    );

    if (locationOverride) {
      return { allowed: true, businessWide: false, locationScoped: true, reason: "" };
    }
  }

  return {
    allowed: false,
    businessWide: false,
    locationScoped: false,
    reason: permissionReason(permission),
  };
}

function permissionReason(permission: ExecutiveDashboardPermission) {
  if (permission === "executive_dashboard:export") {
    return "You do not have permission to export Executive Dashboard reports.";
  }

  if (permission === "executive_dashboard:view_sensitive") {
    return "You do not have permission to view sensitive Executive Dashboard metrics.";
  }

  if (permission === "executive_dashboard:view_staff_summary") {
    return "You do not have permission to view Executive Dashboard staff summaries.";
  }

  return "You do not have permission to view Executive Dashboard.";
}

function readFlag(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
