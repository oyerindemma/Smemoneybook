import { Role } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export type Permission =
  | "admin"
  | "money:write"
  | "reports:write"
  | "inventory:write"
  | "backup:read";

export type BusinessAccess = {
  businessId: string;
  businessName: string;
  role: Role;
};

const permissions: Record<Role, Permission[]> = {
  OWNER: ["admin", "money:write", "reports:write", "inventory:write", "backup:read"],
  ACCOUNTANT: ["money:write", "reports:write", "inventory:write", "backup:read"],
  STAFF: ["money:write", "inventory:write"],
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
  const access = await getBusinessAccess(userId, businessId);

  if (!access) {
    throw new Error("Create a business before continuing.");
  }

  if (permission && !hasPermission(access.role, permission)) {
    throw new Error("You do not have permission to do this.");
  }

  return access;
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
