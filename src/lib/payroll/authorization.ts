import { Role } from "@prisma/client";
import { getActiveBillingPlan } from "@/lib/billing/subscriptions";
import { hasPermission } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";

export type PayrollPermission =
  | "payroll:read"
  | "payroll:manage_employees"
  | "payroll:prepare"
  | "payroll:review"
  | "payroll:approve"
  | "payroll:export"
  | "payroll:post_expense"
  | "payroll:view_sensitive";

export type PayrollAccess = {
  businessId: string;
  businessName: string;
  currency: string;
  userId: string;
  role: Role;
  canRead: boolean;
  canManageEmployees: boolean;
  canPrepare: boolean;
  canReview: boolean;
  canApprove: boolean;
  canExport: boolean;
  canPostExpense: boolean;
  canViewSensitive: boolean;
};

export class PayrollAccessError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "PayrollAccessError";
    this.status = status;
    this.code = code;
  }
}

export function isPayrollFeatureEnabledForServer() {
  return (
    !readFlag(process.env.PHASE3_AI_GLOBAL_KILL_SWITCH, false) &&
    readFlag(process.env.NEXT_PUBLIC_PHASE3_PAYROLL_ENABLED, false) &&
    readFlag(process.env.PHASE3_PAYROLL_ENABLED, false)
  );
}

export function payrollFeatureUnavailableError() {
  return new PayrollAccessError("Payroll is unavailable in this environment.", 503, "feature_disabled");
}

export async function requirePayrollAccess({
  userId,
  businessId,
  permission,
}: {
  userId: string;
  businessId: string;
  permission: PayrollPermission;
}): Promise<PayrollAccess> {
  if (!isPayrollFeatureEnabledForServer()) {
    throw payrollFeatureUnavailableError();
  }

  if (!businessId) {
    throw new PayrollAccessError("Choose a business before opening Payroll.", 400, "business_required");
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
    throw new PayrollAccessError("You do not have access to this business.", 403, "business_access_denied");
  }

  const plan = await getActiveBillingPlan(userId, membership.businessId);

  if (!plan || !plan.features.includes("payroll")) {
    throw new PayrollAccessError("Upgrade to Pro to use Payroll.", 402, "upgrade_required");
  }

  const grant = await getPayrollPermissionGrant({
    businessId: membership.businessId,
    userId,
    role: membership.role,
    permission,
  });

  if (!grant.allowed) {
    throw new PayrollAccessError(grant.reason, 403, "permission_denied");
  }

  const [
    manageEmployees,
    prepare,
    review,
    approve,
    exportGrant,
    postExpense,
    viewSensitive,
  ] = await Promise.all([
    getPayrollPermissionGrant({ businessId: membership.businessId, userId, role: membership.role, permission: "payroll:manage_employees" }),
    getPayrollPermissionGrant({ businessId: membership.businessId, userId, role: membership.role, permission: "payroll:prepare" }),
    getPayrollPermissionGrant({ businessId: membership.businessId, userId, role: membership.role, permission: "payroll:review" }),
    getPayrollPermissionGrant({ businessId: membership.businessId, userId, role: membership.role, permission: "payroll:approve" }),
    getPayrollPermissionGrant({ businessId: membership.businessId, userId, role: membership.role, permission: "payroll:export" }),
    getPayrollPermissionGrant({ businessId: membership.businessId, userId, role: membership.role, permission: "payroll:post_expense" }),
    getPayrollPermissionGrant({ businessId: membership.businessId, userId, role: membership.role, permission: "payroll:view_sensitive" }),
  ]);

  return {
    businessId: membership.business.id,
    businessName: membership.business.name,
    currency: membership.business.currency,
    userId,
    role: membership.role,
    canRead: true,
    canManageEmployees: manageEmployees.allowed,
    canPrepare: prepare.allowed,
    canReview: review.allowed,
    canApprove: approve.allowed,
    canExport: exportGrant.allowed,
    canPostExpense: postExpense.allowed,
    canViewSensitive: viewSensitive.allowed,
  };
}

async function getPayrollPermissionGrant({
  businessId,
  userId,
  role,
  permission,
}: {
  businessId: string;
  userId: string;
  role: Role;
  permission: PayrollPermission;
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

function permissionDeniedMessage(permission: PayrollPermission) {
  if (permission === "payroll:manage_employees") {
    return "You do not have permission to manage payroll employees.";
  }

  if (permission === "payroll:prepare") {
    return "You do not have permission to prepare payroll.";
  }

  if (permission === "payroll:review") {
    return "You do not have permission to review payroll.";
  }

  if (permission === "payroll:approve") {
    return "You do not have permission to approve payroll.";
  }

  if (permission === "payroll:export") {
    return "You do not have permission to export payroll.";
  }

  if (permission === "payroll:post_expense") {
    return "You do not have permission to post payroll expenses.";
  }

  if (permission === "payroll:view_sensitive") {
    return "You do not have permission to view sensitive payroll fields.";
  }

  return "You do not have permission to view Payroll.";
}

function readFlag(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
