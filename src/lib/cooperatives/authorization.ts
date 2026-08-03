import { Role } from "@prisma/client";
import { getActiveBillingPlan } from "@/lib/billing/subscriptions";
import { hasPermission } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";

export type CooperativesPermission =
  | "cooperatives:read"
  | "cooperatives:manage"
  | "cooperatives:manage_members"
  | "cooperatives:record_contributions"
  | "cooperatives:review_loans"
  | "cooperatives:approve_loans"
  | "cooperatives:record_disbursement"
  | "cooperatives:record_repayment"
  | "cooperatives:export"
  | "cooperatives:view_member_sensitive";

export type CooperativesAccess = {
  businessId: string;
  businessName: string;
  currency: string;
  userId: string;
  role: Role;
  canRead: boolean;
  canManage: boolean;
  canManageMembers: boolean;
  canRecordContributions: boolean;
  canReviewLoans: boolean;
  canApproveLoans: boolean;
  canRecordDisbursement: boolean;
  canRecordRepayment: boolean;
  canExport: boolean;
  canViewMemberSensitive: boolean;
};

export class CooperativesAccessError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "CooperativesAccessError";
    this.status = status;
    this.code = code;
  }
}

export function isCooperativesFeatureEnabledForServer() {
  return (
    !readFlag(process.env.PHASE3_AI_GLOBAL_KILL_SWITCH, false) &&
    readFlag(process.env.PHASE3_COOPERATIVES_ENABLED, false) &&
    readFlag(process.env.NEXT_PUBLIC_PHASE3_COOPERATIVES_ENABLED, false)
  );
}

export function cooperativesFeatureUnavailableError() {
  return new CooperativesAccessError("Cooperatives are unavailable in this environment.", 503, "feature_disabled");
}

export async function requireCooperativesAccess({
  userId,
  businessId,
  permission,
}: {
  userId: string;
  businessId: string;
  permission: CooperativesPermission;
}): Promise<CooperativesAccess> {
  if (!isCooperativesFeatureEnabledForServer()) {
    throw cooperativesFeatureUnavailableError();
  }

  if (!businessId) {
    throw new CooperativesAccessError("Choose a business before opening Cooperatives.", 400, "business_required");
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
    throw new CooperativesAccessError("You do not have access to this business.", 403, "business_access_denied");
  }

  const plan = await getActiveBillingPlan(userId, membership.businessId);

  if (!plan || !plan.features.includes("cooperatives")) {
    throw new CooperativesAccessError("Upgrade to Pro to use Cooperatives.", 402, "upgrade_required");
  }

  const grant = await getCooperativesPermissionGrant({
    businessId: membership.businessId,
    userId,
    role: membership.role,
    permission,
  });

  if (!grant.allowed) {
    throw new CooperativesAccessError(grant.reason, 403, "permission_denied");
  }

  const [
    manage,
    manageMembers,
    recordContributions,
    reviewLoans,
    approveLoans,
    recordDisbursement,
    recordRepayment,
    exportGrant,
    viewMemberSensitive,
  ] = await Promise.all([
    getCooperativesPermissionGrant({ businessId: membership.businessId, userId, role: membership.role, permission: "cooperatives:manage" }),
    getCooperativesPermissionGrant({ businessId: membership.businessId, userId, role: membership.role, permission: "cooperatives:manage_members" }),
    getCooperativesPermissionGrant({ businessId: membership.businessId, userId, role: membership.role, permission: "cooperatives:record_contributions" }),
    getCooperativesPermissionGrant({ businessId: membership.businessId, userId, role: membership.role, permission: "cooperatives:review_loans" }),
    getCooperativesPermissionGrant({ businessId: membership.businessId, userId, role: membership.role, permission: "cooperatives:approve_loans" }),
    getCooperativesPermissionGrant({ businessId: membership.businessId, userId, role: membership.role, permission: "cooperatives:record_disbursement" }),
    getCooperativesPermissionGrant({ businessId: membership.businessId, userId, role: membership.role, permission: "cooperatives:record_repayment" }),
    getCooperativesPermissionGrant({ businessId: membership.businessId, userId, role: membership.role, permission: "cooperatives:export" }),
    getCooperativesPermissionGrant({ businessId: membership.businessId, userId, role: membership.role, permission: "cooperatives:view_member_sensitive" }),
  ]);

  return {
    businessId: membership.business.id,
    businessName: membership.business.name,
    currency: membership.business.currency,
    userId,
    role: membership.role,
    canRead: true,
    canManage: manage.allowed,
    canManageMembers: manageMembers.allowed,
    canRecordContributions: recordContributions.allowed,
    canReviewLoans: reviewLoans.allowed,
    canApproveLoans: approveLoans.allowed,
    canRecordDisbursement: recordDisbursement.allowed,
    canRecordRepayment: recordRepayment.allowed,
    canExport: exportGrant.allowed,
    canViewMemberSensitive: viewMemberSensitive.allowed,
  };
}

async function getCooperativesPermissionGrant({
  businessId,
  userId,
  role,
  permission,
}: {
  businessId: string;
  userId: string;
  role: Role;
  permission: CooperativesPermission;
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

function permissionDeniedMessage(permission: CooperativesPermission) {
  if (permission === "cooperatives:manage") {
    return "You do not have permission to manage cooperatives.";
  }

  if (permission === "cooperatives:manage_members") {
    return "You do not have permission to manage cooperative members.";
  }

  if (permission === "cooperatives:record_contributions") {
    return "You do not have permission to record cooperative contributions.";
  }

  if (permission === "cooperatives:review_loans") {
    return "You do not have permission to review cooperative loans.";
  }

  if (permission === "cooperatives:approve_loans") {
    return "You do not have permission to approve cooperative loans.";
  }

  if (permission === "cooperatives:record_disbursement") {
    return "You do not have permission to record cooperative loan disbursement.";
  }

  if (permission === "cooperatives:record_repayment") {
    return "You do not have permission to record cooperative loan repayments.";
  }

  if (permission === "cooperatives:export") {
    return "You do not have permission to export cooperative records.";
  }

  if (permission === "cooperatives:view_member_sensitive") {
    return "You do not have permission to view sensitive cooperative member fields.";
  }

  return "You do not have permission to view Cooperatives.";
}

function readFlag(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
