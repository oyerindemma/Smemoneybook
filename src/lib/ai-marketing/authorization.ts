import { Role } from "@prisma/client";
import { getActiveBillingPlan } from "@/lib/billing/subscriptions";
import { hasPermission } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";

export type AiMarketingPermission =
  | "ai_marketing:read"
  | "ai_marketing:create"
  | "ai_marketing:approve"
  | "ai_marketing:send"
  | "ai_marketing:export"
  | "ai_marketing:manage_consent";

export type AiMarketingAccess = {
  businessId: string;
  businessName: string;
  currency: string;
  userId: string;
  role: Role;
  canRead: boolean;
  canCreate: boolean;
  canApprove: boolean;
  canSend: boolean;
  canExport: boolean;
  canManageConsent: boolean;
};

export class AiMarketingAccessError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "AiMarketingAccessError";
    this.status = status;
    this.code = code;
  }
}

export function isAiMarketingFeatureEnabledForServer() {
  return (
    !readFlag(process.env.PHASE3_AI_GLOBAL_KILL_SWITCH, false) &&
    readFlag(process.env.NEXT_PUBLIC_PHASE3_AI_MARKETING_ENABLED, false) &&
    readFlag(process.env.PHASE3_AI_MARKETING_ENABLED, false)
  );
}

export function aiMarketingFeatureUnavailableError() {
  return new AiMarketingAccessError(
    "AI Marketing is unavailable in this environment.",
    503,
    "feature_disabled",
  );
}

export async function requireAiMarketingAccess({
  userId,
  businessId,
  permission,
}: {
  userId: string;
  businessId: string;
  permission: AiMarketingPermission;
}): Promise<AiMarketingAccess> {
  if (!isAiMarketingFeatureEnabledForServer()) {
    throw aiMarketingFeatureUnavailableError();
  }

  if (!businessId) {
    throw new AiMarketingAccessError("Choose a business before opening AI Marketing.", 400, "business_required");
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
    throw new AiMarketingAccessError("You do not have access to this business.", 403, "business_access_denied");
  }

  const plan = await getActiveBillingPlan(userId, membership.businessId);

  if (!plan || !plan.features.includes("ai_marketing")) {
    throw new AiMarketingAccessError("Upgrade to Growth or Pro to use AI Marketing.", 402, "upgrade_required");
  }

  const permissionGrant = await getAiMarketingPermissionGrant({
    businessId: membership.businessId,
    userId,
    role: membership.role,
    permission,
  });

  if (!permissionGrant.allowed) {
    throw new AiMarketingAccessError(permissionGrant.reason, 403, "permission_denied");
  }

  const [createGrant, approveGrant, sendGrant, exportGrant, consentGrant] = await Promise.all([
    getAiMarketingPermissionGrant({
      businessId: membership.businessId,
      userId,
      role: membership.role,
      permission: "ai_marketing:create",
    }),
    getAiMarketingPermissionGrant({
      businessId: membership.businessId,
      userId,
      role: membership.role,
      permission: "ai_marketing:approve",
    }),
    getAiMarketingPermissionGrant({
      businessId: membership.businessId,
      userId,
      role: membership.role,
      permission: "ai_marketing:send",
    }),
    getAiMarketingPermissionGrant({
      businessId: membership.businessId,
      userId,
      role: membership.role,
      permission: "ai_marketing:export",
    }),
    getAiMarketingPermissionGrant({
      businessId: membership.businessId,
      userId,
      role: membership.role,
      permission: "ai_marketing:manage_consent",
    }),
  ]);

  return {
    businessId: membership.business.id,
    businessName: membership.business.name,
    currency: membership.business.currency,
    userId,
    role: membership.role,
    canRead: true,
    canCreate: createGrant.allowed,
    canApprove: approveGrant.allowed,
    canSend: sendGrant.allowed,
    canExport: exportGrant.allowed,
    canManageConsent: consentGrant.allowed,
  };
}

async function getAiMarketingPermissionGrant({
  businessId,
  userId,
  role,
  permission,
}: {
  businessId: string;
  userId: string;
  role: Role;
  permission: AiMarketingPermission;
}) {
  if (hasPermission(role, permission)) {
    return { allowed: true, reason: "" };
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
        OR: [{ locationId: null }],
      },
      select: { permissions: true },
    }),
  ]);

  if (policy?.permissions.includes(permission)) {
    return { allowed: true, reason: "" };
  }

  if (overrides.some((override) => override.permissions.includes(permission))) {
    return { allowed: true, reason: "" };
  }

  return { allowed: false, reason: permissionDeniedMessage(permission) };
}

function permissionDeniedMessage(permission: AiMarketingPermission) {
  if (permission === "ai_marketing:create") {
    return "You do not have permission to create AI Marketing campaigns.";
  }

  if (permission === "ai_marketing:approve") {
    return "You do not have permission to approve AI Marketing campaigns.";
  }

  if (permission === "ai_marketing:send") {
    return "You do not have permission to send AI Marketing campaigns.";
  }

  if (permission === "ai_marketing:export") {
    return "You do not have permission to export AI Marketing campaigns.";
  }

  if (permission === "ai_marketing:manage_consent") {
    return "You do not have permission to update AI Marketing consent.";
  }

  return "You do not have permission to view AI Marketing.";
}

function readFlag(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
