import { BusinessLocationType, Role } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export type Permission =
  | "admin"
  | "money:write"
  | "reports:write"
  | "inventory:write"
  | "backup:read"
  | "locations:view"
  | "locations:create"
  | "locations:edit"
  | "locations:archive"
  | "transfers:view"
  | "transfers:create"
  | "transfers:approve"
  | "transfers:receive"
  | "transfers:cancel"
  | "bank_reconciliation:read"
  | "bank_reconciliation:import"
  | "bank_reconciliation:match"
  | "bank_reconciliation:review"
  | "bank_reconciliation:export"
  | "bank_reconciliation:ignore"
  | "tax_assistant:read"
  | "tax_assistant:ask"
  | "tax_assistant:review"
  | "tax_assistant:export"
  | "tax_assistant:manage_settings"
  | "executive_dashboard:read"
  | "executive_dashboard:export"
  | "executive_dashboard:view_sensitive"
  | "executive_dashboard:view_staff_summary"
  | "predictive_alerts:read"
  | "predictive_alerts:manage"
  | "predictive_alerts:acknowledge"
  | "predictive_alerts:export"
  | "cooperatives:read"
  | "cooperatives:manage"
  | "cooperatives:manage_members"
  | "cooperatives:record_contributions"
  | "cooperatives:review_loans"
  | "cooperatives:approve_loans"
  | "cooperatives:record_disbursement"
  | "cooperatives:record_repayment"
  | "cooperatives:export"
  | "cooperatives:view_member_sensitive"
  | "payroll:read"
  | "payroll:manage_employees"
  | "payroll:prepare"
  | "payroll:review"
  | "payroll:approve"
  | "payroll:export"
  | "payroll:post_expense"
  | "payroll:view_sensitive"
  | "ai_marketing:read"
  | "ai_marketing:create"
  | "ai_marketing:approve"
  | "ai_marketing:send"
  | "ai_marketing:export"
  | "ai_marketing:manage_consent"
  | "ai_evaluation:read"
  | "ai_evaluation:run"
  | "ai_evaluation:manage_cases"
  | "ai_evaluation:export"
  | "ai_evaluation:compare_models"
  | "staff_performance:read"
  | "staff_performance:export";

export type BusinessAccess = {
  businessId: string;
  businessName: string;
  role: Role;
};

const permissions: Record<Role, Permission[]> = {
  OWNER: [
    "admin",
    "money:write",
    "reports:write",
    "inventory:write",
    "backup:read",
    "locations:view",
    "locations:create",
    "locations:edit",
    "locations:archive",
    "transfers:view",
    "transfers:create",
    "transfers:approve",
    "transfers:receive",
    "transfers:cancel",
    "bank_reconciliation:read",
    "bank_reconciliation:import",
    "bank_reconciliation:match",
    "bank_reconciliation:review",
    "bank_reconciliation:export",
    "bank_reconciliation:ignore",
    "tax_assistant:read",
    "tax_assistant:ask",
    "tax_assistant:review",
    "tax_assistant:export",
    "tax_assistant:manage_settings",
    "executive_dashboard:read",
    "executive_dashboard:export",
    "executive_dashboard:view_sensitive",
    "executive_dashboard:view_staff_summary",
    "predictive_alerts:read",
    "predictive_alerts:manage",
    "predictive_alerts:acknowledge",
    "predictive_alerts:export",
    "cooperatives:read",
    "cooperatives:manage",
    "cooperatives:manage_members",
    "cooperatives:record_contributions",
    "cooperatives:review_loans",
    "cooperatives:approve_loans",
    "cooperatives:record_disbursement",
    "cooperatives:record_repayment",
    "cooperatives:export",
    "cooperatives:view_member_sensitive",
    "payroll:read",
    "payroll:manage_employees",
    "payroll:prepare",
    "payroll:review",
    "payroll:approve",
    "payroll:export",
    "payroll:post_expense",
    "payroll:view_sensitive",
    "ai_marketing:read",
    "ai_marketing:create",
    "ai_marketing:approve",
    "ai_marketing:send",
    "ai_marketing:export",
    "ai_marketing:manage_consent",
    "ai_evaluation:read",
    "ai_evaluation:run",
    "ai_evaluation:manage_cases",
    "ai_evaluation:export",
    "ai_evaluation:compare_models",
    "staff_performance:read",
    "staff_performance:export",
  ],
  ACCOUNTANT: [
    "reports:write",
    "backup:read",
    "locations:view",
    "transfers:view",
    "bank_reconciliation:read",
    "bank_reconciliation:import",
    "bank_reconciliation:match",
    "bank_reconciliation:review",
    "bank_reconciliation:export",
    "bank_reconciliation:ignore",
    "tax_assistant:read",
    "tax_assistant:ask",
    "tax_assistant:review",
    "tax_assistant:export",
    "executive_dashboard:read",
    "executive_dashboard:export",
    "executive_dashboard:view_sensitive",
    "predictive_alerts:read",
    "predictive_alerts:acknowledge",
    "predictive_alerts:export",
    "cooperatives:read",
    "cooperatives:export",
    "cooperatives:view_member_sensitive",
  ],
  STAFF: [
    "money:write",
    "inventory:write",
    "locations:view",
    "transfers:view",
    "transfers:create",
    "transfers:receive",
  ],
};

export function hasPermission(role: Role, permission: Permission) {
  return permissions[role].includes(permission);
}

export async function getBusinessAccess(
  userId: string,
  businessId?: string,
): Promise<BusinessAccess | null> {
  const membership = await getPrisma().businessMember.findFirst({
    where: { userId, businessId },
    orderBy: { createdAt: "asc" },
    include: { business: { select: { id: true, name: true } } },
  });

  if (!membership) {
    return null;
  }

  return {
    businessId: membership.business.id,
    businessName: membership.business.name,
    role: membership.role,
  };
}

export async function requireBusinessAccess(
  userId: string,
  permission?: Permission,
  businessId?: string,
): Promise<BusinessAccess> {
  if (permission && !businessId) {
    throw new Error("Select a business before continuing.");
  }

  const access = await getBusinessAccess(userId, businessId);

  if (!access) {
    throw new Error("Create a business before continuing.");
  }

  if (permission && !hasPermission(access.role, permission)) {
    throw new Error("You do not have permission to do this.");
  }

  return access;
}

export type LocationAccess = BusinessAccess & {
  locationId: string;
  locationName: string;
  locationType: BusinessLocationType;
  isDefaultLocation: boolean;
};

export async function getDefaultBusinessLocation(businessId: string) {
  return getPrisma().businessLocation.findFirst({
    where: {
      businessId,
      isDefault: true,
      archivedAt: null,
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      type: true,
      isDefault: true,
    },
  });
}

export async function requireLocationAccess({
  userId,
  businessId,
  locationId,
  permission = "locations:view",
}: {
  userId: string;
  businessId?: string;
  locationId?: string;
  permission?: Permission;
}): Promise<LocationAccess> {
  const access = await requireBusinessAccess(userId, permission, businessId);
  const location = locationId
    ? await getPrisma().businessLocation.findFirst({
        where: {
          id: locationId,
          businessId: access.businessId,
          archivedAt: null,
        },
        select: {
          id: true,
          name: true,
          type: true,
          isDefault: true,
        },
      })
    : await getDefaultBusinessLocation(access.businessId);

  if (!location) {
    throw new Error("Choose a valid business location.");
  }

  if (access.role !== Role.OWNER) {
    const membership = await getPrisma().businessLocationMember.findFirst({
      where: {
        businessId: access.businessId,
        locationId: location.id,
        userId,
      },
      select: { id: true },
    });

    if (!membership) {
      throw new Error("You do not have access to this location.");
    }
  }

  return {
    ...access,
    locationId: location.id,
    locationName: location.name,
    locationType: location.type,
    isDefaultLocation: location.isDefault,
  };
}

export function mapRole(role: Role) {
  return role.toLowerCase() as "owner" | "accountant" | "staff";
}

export function toDbRole(role: "owner" | "accountant" | "staff") {
  if (role === "accountant") {
    return Role.ACCOUNTANT;
  }

  if (role === "staff") {
    return Role.STAFF;
  }

  return Role.OWNER;
}
