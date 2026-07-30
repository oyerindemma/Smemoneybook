import { Role } from "@prisma/client";
import { requireBusinessAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";

export const permissionRegistry = [
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
] as const;

export async function listPermissionPoliciesForUser(userId: string, businessId: string) {
  const access = await requireBusinessAccess(userId, "admin", businessId);
  const policies = await getPrisma().permissionPolicy.findMany({
    where: { businessId: access.businessId },
    orderBy: { role: "asc" },
  });

  return {
    permissions: permissionRegistry,
    policies: policies.map((policy) => ({
      role: policy.role.toLowerCase(),
      permissions: policy.permissions,
    })),
  };
}

export async function savePermissionPolicyForUser({
  userId,
  businessId,
  role,
  permissions,
}: {
  userId: string;
  businessId: string;
  role: "owner" | "staff" | "accountant";
  permissions: string[];
}) {
  const access = await requireBusinessAccess(userId, "admin", businessId);
  const dbRole = role.toUpperCase() as Role;
  const safePermissions = permissions.filter((permission) =>
    permissionRegistry.includes(permission as (typeof permissionRegistry)[number]),
  );

  await getPrisma().permissionPolicy.upsert({
    where: { businessId_role: { businessId: access.businessId, role: dbRole } },
    create: { businessId: access.businessId, role: dbRole, permissions: safePermissions },
    update: { permissions: safePermissions },
  });

  await getPrisma().auditLog.create({
    data: {
      businessId: access.businessId,
      actorId: userId,
      action: "permissions.policy_saved",
      message: `${role} permission policy was saved.`,
      metadata: { role, permissions: safePermissions },
    },
  });

  return listPermissionPoliciesForUser(userId, access.businessId);
}
