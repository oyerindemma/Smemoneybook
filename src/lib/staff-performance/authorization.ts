import { Role } from "@prisma/client";
import { getActiveBillingPlan } from "@/lib/billing/subscriptions";
import { getPrisma } from "@/lib/prisma";
import type { StaffPerformancePermission } from "@/lib/staff-performance/definitions";

export type StaffPerformanceAccess = {
  businessId: string;
  businessName: string;
  currency: string;
  userId: string;
  role: Role;
  locationId?: string;
  locationName?: string;
};

export class StaffPerformanceAccessError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "StaffPerformanceAccessError";
    this.status = status;
    this.code = code;
  }
}

export function isStaffPerformanceFeatureEnabledForServer() {
  return (
    !readFlag(process.env.PHASE3_AI_GLOBAL_KILL_SWITCH, false) &&
    readFlag(process.env.NEXT_PUBLIC_PHASE3_STAFF_PERFORMANCE_ENABLED, false) &&
    readFlag(process.env.PHASE3_STAFF_PERFORMANCE_ENABLED, false)
  );
}

export function staffPerformanceFeatureUnavailableError() {
  return new StaffPerformanceAccessError(
    "Staff Performance is unavailable in this environment.",
    503,
    "feature_disabled",
  );
}

export async function requireStaffPerformanceAccess({
  userId,
  businessId,
  permission,
  locationId,
}: {
  userId: string;
  businessId: string;
  permission: StaffPerformancePermission;
  locationId?: string;
}): Promise<StaffPerformanceAccess> {
  if (!isStaffPerformanceFeatureEnabledForServer()) {
    throw staffPerformanceFeatureUnavailableError();
  }

  if (!businessId) {
    throw new StaffPerformanceAccessError("Choose a business before opening Staff Performance.", 400, "business_required");
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
    throw new StaffPerformanceAccessError(
      "You do not have access to this business.",
      403,
      "business_access_denied",
    );
  }

  const plan = await getActiveBillingPlan(userId, membership.businessId);

  if (
    plan?.id !== "pro" ||
    !plan.features.includes("advanced_reports") ||
    !plan.features.includes("granular_permissions") ||
    !plan.features.includes("audit_tools")
  ) {
    throw new StaffPerformanceAccessError(
      "Upgrade to Pro to use Staff Performance.",
      402,
      "upgrade_required",
    );
  }

  const permissionGrant = await getStaffPerformancePermissionGrant({
    businessId: membership.businessId,
    userId,
    role: membership.role,
    permission,
    locationId,
  });

  if (!permissionGrant.allowed) {
    throw new StaffPerformanceAccessError(
      permissionGrant.reason,
      403,
      "permission_denied",
    );
  }

  const location = locationId
    ? await prisma.businessLocation.findFirst({
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
    : null;

  if (locationId && !location) {
    throw new StaffPerformanceAccessError("Choose a valid business location.", 400, "location_invalid");
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
      throw new StaffPerformanceAccessError(
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
  };
}

export async function assertStaffMemberBelongsToBusiness({
  businessId,
  staffId,
}: {
  businessId: string;
  staffId: string;
}) {
  const member = await getPrisma().businessMember.findFirst({
    where: { businessId, userId: staffId },
    select: { id: true },
  });

  if (!member) {
    throw new StaffPerformanceAccessError(
      "Choose a staff member in this business.",
      404,
      "staff_not_found",
    );
  }
}

async function getStaffPerformancePermissionGrant({
  businessId,
  userId,
  role,
  permission,
  locationId,
}: {
  businessId: string;
  userId: string;
  role: Role;
  permission: StaffPerformancePermission;
  locationId?: string;
}) {
  if (role === Role.OWNER) {
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
    reason:
      permission === "staff_performance:export"
        ? "You do not have permission to export Staff Performance reports."
        : "You do not have permission to view Staff Performance.",
  };
}

function readFlag(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
