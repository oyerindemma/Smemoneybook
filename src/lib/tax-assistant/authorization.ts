import { Role } from "@prisma/client";
import { getActiveBillingPlan } from "@/lib/billing/subscriptions";
import { hasPermission } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";
import type { TaxAssistantPermission } from "@/lib/tax-assistant/definitions";
import { readFlag } from "@/lib/tax-assistant/rules";

export type TaxAssistantAccess = {
  businessId: string;
  businessName: string;
  currency: string;
  userId: string;
  role: Role;
  locationId?: string;
  locationName?: string;
};

export class TaxAssistantAccessError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "TaxAssistantAccessError";
    this.status = status;
    this.code = code;
  }
}

export function isTaxAssistantFeatureEnabledForServer() {
  return (
    readFlag(process.env.PHASE3_AI_ENABLED, false) &&
    !readFlag(process.env.PHASE3_AI_GLOBAL_KILL_SWITCH, false) &&
    readFlag(process.env.NEXT_PUBLIC_PHASE3_TAX_ASSISTANT_ENABLED, false) &&
    readFlag(process.env.PHASE3_TAX_ASSISTANT_ENABLED, false)
  );
}

export function taxAssistantFeatureUnavailableError() {
  return new TaxAssistantAccessError(
    "Tax Assistant is unavailable in this environment.",
    503,
    "feature_disabled",
  );
}

export async function requireTaxAssistantAccess({
  userId,
  businessId,
  permission,
  locationId,
}: {
  userId: string;
  businessId: string;
  permission: TaxAssistantPermission;
  locationId?: string;
}): Promise<TaxAssistantAccess> {
  if (!isTaxAssistantFeatureEnabledForServer()) {
    throw taxAssistantFeatureUnavailableError();
  }

  if (!businessId) {
    throw new TaxAssistantAccessError("Choose a business before opening Tax Assistant.", 400, "business_required");
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
    throw new TaxAssistantAccessError("You do not have access to this business.", 403, "business_access_denied");
  }

  const plan = await getActiveBillingPlan(userId, membership.businessId);

  if (!plan || !["growth", "pro"].includes(plan.id) || !plan.features.includes("tax_assistant")) {
    throw new TaxAssistantAccessError("Upgrade to Growth to use Tax Assistant.", 402, "upgrade_required");
  }

  const permissionGrant = await getTaxAssistantPermissionGrant({
    businessId: membership.businessId,
    userId,
    role: membership.role,
    permission,
    locationId,
  });

  if (!permissionGrant.allowed) {
    throw new TaxAssistantAccessError(permissionGrant.reason, 403, "permission_denied");
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
    throw new TaxAssistantAccessError("Choose a valid business location.", 400, "location_invalid");
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
      throw new TaxAssistantAccessError("You do not have access to this location.", 403, "location_access_denied");
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

async function getTaxAssistantPermissionGrant({
  businessId,
  userId,
  role,
  permission,
  locationId,
}: {
  businessId: string;
  userId: string;
  role: Role;
  permission: TaxAssistantPermission;
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

function permissionReason(permission: TaxAssistantPermission) {
  if (permission === "tax_assistant:ask") {
    return "You do not have permission to ask Tax Assistant questions.";
  }

  if (permission === "tax_assistant:review") {
    return "You do not have permission to review Tax Assistant items.";
  }

  if (permission === "tax_assistant:export") {
    return "You do not have permission to export Tax Assistant reports.";
  }

  if (permission === "tax_assistant:manage_settings") {
    return "You do not have permission to manage Tax Assistant settings.";
  }

  return "You do not have permission to view Tax Assistant.";
}
