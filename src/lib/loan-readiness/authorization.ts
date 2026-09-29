import { Role } from "@prisma/client";
import { getActiveBillingPlan } from "@/lib/billing/subscriptions";
import { hasPermission } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";
import type {
  LoanReadinessCapabilities,
  LoanReadinessPermission,
} from "@/lib/loan-readiness/definitions";

export type LoanReadinessAccess = {
  businessId: string;
  businessName: string;
  currency: string;
  userId: string;
  role: Role;
  locationId?: string;
  locationName?: string;
  capabilities: LoanReadinessCapabilities;
};

export class LoanReadinessAccessError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "LoanReadinessAccessError";
    this.status = status;
    this.code = code;
  }
}

export function isLoanReadinessFeatureEnabledForServer() {
  return (
    !readFlag(process.env.PHASE3_AI_GLOBAL_KILL_SWITCH, false) &&
    readFlag(process.env.PHASE3_LOAN_READINESS_ENABLED, false) &&
    readFlag(process.env.NEXT_PUBLIC_PHASE3_LOAN_READINESS_ENABLED, false)
  );
}

export async function requireLoanReadinessAccess({
  userId,
  businessId,
  permission,
  locationId,
}: {
  userId: string;
  businessId: string;
  permission: LoanReadinessPermission;
  locationId?: string;
}): Promise<LoanReadinessAccess> {
  if (!isLoanReadinessFeatureEnabledForServer()) {
    throw new LoanReadinessAccessError(
      "Loan Readiness is unavailable in this environment.",
      503,
      "feature_disabled",
    );
  }

  if (!businessId) {
    throw new LoanReadinessAccessError(
      "Choose a business before opening Loan Readiness.",
      400,
      "business_required",
    );
  }

  const prisma = getPrisma();
  const membership = await prisma.businessMember.findFirst({
    where: { userId, businessId },
    include: {
      business: {
        select: { id: true, name: true, currency: true },
      },
    },
  });

  if (!membership) {
    throw new LoanReadinessAccessError(
      "You do not have access to this business.",
      403,
      "business_access_denied",
    );
  }

  const plan = await getActiveBillingPlan(userId, membership.businessId);

  if (!plan?.features.includes("loan_readiness")) {
    throw new LoanReadinessAccessError(
      "Upgrade to Growth or Pro to use Loan Readiness.",
      402,
      "upgrade_required",
    );
  }

  const grant = await getPermissionGrant({
    businessId: membership.businessId,
    userId,
    role: membership.role,
    permission,
    locationId,
  });

  if (!grant.allowed) {
    throw new LoanReadinessAccessError(grant.reason, 403, "permission_denied");
  }

  const location = locationId
    ? await prisma.businessLocation.findFirst({
        where: { id: locationId, businessId: membership.businessId, archivedAt: null },
        select: { id: true, name: true },
      })
    : null;

  if (locationId && !location) {
    throw new LoanReadinessAccessError("Choose a valid business location.", 400, "location_invalid");
  }

  if (location && membership.role !== Role.OWNER && !grant.businessWide) {
    const locationMembership = await prisma.businessLocationMember.findFirst({
      where: { businessId: membership.businessId, locationId: location.id, userId },
      select: { id: true },
    });

    if (!locationMembership && !grant.locationScoped) {
      throw new LoanReadinessAccessError(
        "You do not have access to this location.",
        403,
        "location_access_denied",
      );
    }
  }

  const [generate, exportGrant, manageProfile] = await Promise.all([
    getPermissionGrant({
      businessId: membership.businessId,
      userId,
      role: membership.role,
      permission: "loan_readiness:generate",
      locationId,
    }),
    getPermissionGrant({
      businessId: membership.businessId,
      userId,
      role: membership.role,
      permission: "loan_readiness:export",
      locationId,
    }),
    getPermissionGrant({
      businessId: membership.businessId,
      userId,
      role: membership.role,
      permission: "loan_readiness:manage_profile",
    }),
  ]);

  return {
    businessId: membership.business.id,
    businessName: membership.business.name,
    currency: membership.business.currency,
    userId,
    role: membership.role,
    locationId: location?.id,
    locationName: location?.name,
    capabilities: {
      canRead: true,
      canGenerate: generate.allowed,
      canExport: exportGrant.allowed,
      canManageProfile: manageProfile.allowed,
    },
  };
}

async function getPermissionGrant({
  businessId,
  userId,
  role,
  permission,
  locationId,
}: {
  businessId: string;
  userId: string;
  role: Role;
  permission: LoanReadinessPermission;
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
        OR: locationId ? [{ locationId: null }, { locationId }] : [{ locationId: null }],
      },
      select: { locationId: true, permissions: true },
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

  const locationOverride = locationId
    ? overrides.find(
        (override) => override.locationId === locationId && override.permissions.includes(permission),
      )
    : undefined;
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

function permissionDeniedMessage(permission: LoanReadinessPermission) {
  if (permission === "loan_readiness:generate") {
    return "You do not have permission to generate Loan Readiness assessments.";
  }
  if (permission === "loan_readiness:export") {
    return "You do not have permission to export Loan Readiness reports.";
  }
  if (permission === "loan_readiness:manage_profile") {
    return "You do not have permission to update the Loan Readiness profile.";
  }
  return "You do not have permission to view Loan Readiness.";
}

function readFlag(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
