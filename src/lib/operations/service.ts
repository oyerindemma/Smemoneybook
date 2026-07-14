import { randomBytes } from "node:crypto";
import { Role } from "@prisma/client";
import { restoreBackupRequestSchema } from "@/lib/api/validation";
import { requireBusinessAccess, mapRole, toDbRole } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";

const inviteDays = 7;
const backupRowLimit = 10_000;
const backupNestedMovementLimit = 100;

export async function inviteStaff({
  actorId,
  businessId,
  email,
  role,
}: {
  actorId: string;
  businessId?: string;
  email: string;
  role: "staff" | "accountant";
}) {
  const access = await requireBusinessAccess(actorId, "admin", businessId);
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + inviteDays * 24 * 60 * 60 * 1000);

  const invitation = await getPrisma().businessInvitation.create({
    data: {
      businessId: access.businessId,
      invitedById: actorId,
      email,
      role: toDbRole(role),
      token,
      expiresAt,
    },
  });

  await getPrisma().auditLog.create({
    data: {
      businessId: access.businessId,
      actorId,
      action: "staff.invited",
      message: `${email} was invited as ${role}.`,
    },
  });

  return mapInvitation(invitation, { includeToken: true });
}

export async function acceptInvitation({
  token,
  userId,
}: {
  token: string;
  userId: string;
}) {
  const user = await getPrisma().user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });
  const invitation = await getPrisma().businessInvitation.findUnique({
    where: { token },
  });

  if (!invitation || invitation.revokedAt || invitation.acceptedAt) {
    throw new Error("This invitation is no longer available.");
  }

  if (invitation.expiresAt <= new Date()) {
    throw new Error("This invitation has expired.");
  }

  if (invitation.email !== user.email) {
    throw new Error("Sign in with the invited email to accept this invitation.");
  }

  await getPrisma().$transaction(async (tx) => {
    await tx.businessMember.upsert({
      where: {
        userId_businessId: {
          userId,
          businessId: invitation.businessId,
        },
      },
      update: { role: invitation.role },
      create: {
        userId,
        businessId: invitation.businessId,
        role: invitation.role,
      },
    });
    await tx.businessInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        businessId: invitation.businessId,
        actorId: userId,
        action: "staff.accepted",
        message: `${user.name} joined the business as ${mapRole(invitation.role)}.`,
      },
    });
  });

  return { ok: true };
}

export async function getOperationsOverview(userId: string, businessId?: string) {
  const access = await requireBusinessAccess(userId, "admin", businessId);
  const prisma = getPrisma();
  const [members, invitations, auditLogs, apiErrors] = await Promise.all([
    prisma.businessMember.findMany({
      where: { businessId: access.businessId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.businessInvitation.findMany({
      where: { businessId: access.businessId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.auditLog.findMany({
      where: { businessId: access.businessId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { actor: { select: { name: true, email: true } } },
    }),
    prisma.apiErrorLog.findMany({
      where: { businessId: access.businessId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return {
    business: {
      id: access.businessId,
      name: access.businessName,
      role: mapRole(access.role),
      canManageStaff: access.role === Role.OWNER,
      canExportBackup: access.role === Role.OWNER || access.role === Role.ACCOUNTANT,
    },
    members: members.map((member) => ({
      id: member.id,
      name: member.user.name,
      email: member.user.email,
      role: mapRole(member.role),
      joinedAt: member.createdAt.toISOString(),
    })),
    invitations: invitations.map((invitation) => mapInvitation(invitation, { includeToken: true })),
    auditLogs: auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      message: log.message,
      actorName: log.actor?.name,
      createdAt: log.createdAt.toISOString(),
    })),
    apiErrors: apiErrors.map((error) => ({
      id: error.id,
      route: error.route,
      method: error.method,
      message: error.message,
      code: error.code,
      createdAt: error.createdAt.toISOString(),
    })),
  };
}

export async function exportBusinessBackup(userId: string, businessId?: string) {
  const access = await requireBusinessAccess(userId, "backup:read", businessId);
  const prisma = getPrisma();
  const [
    business,
    accounts,
    customers,
    suppliers,
    transactions,
    debts,
    items,
    taxRuns,
    reportSnapshots,
    auditLogs,
    counts,
  ] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: access.businessId } }),
    prisma.account.findMany({
      where: { businessId: access.businessId },
      orderBy: { createdAt: "asc" },
      take: backupRowLimit,
    }),
    prisma.customer.findMany({
      where: { businessId: access.businessId },
      orderBy: { createdAt: "asc" },
      take: backupRowLimit,
    }),
    prisma.supplier.findMany({
      where: { businessId: access.businessId },
      orderBy: { createdAt: "asc" },
      take: backupRowLimit,
    }),
    prisma.transaction.findMany({
      where: { businessId: access.businessId },
      orderBy: { occurredAt: "asc" },
      take: backupRowLimit,
    }),
    prisma.debt.findMany({
      where: { businessId: access.businessId },
      orderBy: { createdAt: "asc" },
      take: backupRowLimit,
    }),
    prisma.inventoryItem.findMany({
      where: { businessId: access.businessId },
      orderBy: { createdAt: "asc" },
      take: backupRowLimit,
      include: {
        movements: { orderBy: { createdAt: "desc" }, take: backupNestedMovementLimit },
      },
    }),
    prisma.taxRun.findMany({
      where: { businessId: access.businessId },
      orderBy: { createdAt: "asc" },
      take: backupRowLimit,
    }),
    prisma.reportSnapshot.findMany({
      where: { businessId: access.businessId },
      orderBy: { createdAt: "asc" },
      take: backupRowLimit,
    }),
    prisma.auditLog.findMany({
      where: { businessId: access.businessId },
      orderBy: { createdAt: "asc" },
      take: backupRowLimit,
    }),
    Promise.all([
      prisma.account.count({ where: { businessId: access.businessId } }),
      prisma.customer.count({ where: { businessId: access.businessId } }),
      prisma.supplier.count({ where: { businessId: access.businessId } }),
      prisma.transaction.count({ where: { businessId: access.businessId } }),
      prisma.debt.count({ where: { businessId: access.businessId } }),
      prisma.inventoryItem.count({ where: { businessId: access.businessId } }),
      prisma.taxRun.count({ where: { businessId: access.businessId } }),
      prisma.reportSnapshot.count({ where: { businessId: access.businessId } }),
      prisma.auditLog.count({ where: { businessId: access.businessId } }),
    ]),
  ]);

  await prisma.auditLog.create({
    data: {
      businessId: access.businessId,
      actorId: userId,
      action: "backup.exported",
      message: "A business backup was exported.",
    },
  });

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    rowLimit: backupRowLimit,
    truncated:
      accounts.length < counts[0] ||
      customers.length < counts[1] ||
      suppliers.length < counts[2] ||
      transactions.length < counts[3] ||
      debts.length < counts[4] ||
      items.length < counts[5] ||
      taxRuns.length < counts[6] ||
      reportSnapshots.length < counts[7] ||
      auditLogs.length < counts[8],
    sourceCounts: {
      accounts: counts[0],
      customers: counts[1],
      suppliers: counts[2],
      transactions: counts[3],
      debts: counts[4],
      inventoryItems: counts[5],
      taxRuns: counts[6],
      reportSnapshots: counts[7],
      auditLogs: counts[8],
    },
    business: {
      ...business,
      accounts,
      customers,
      suppliers,
      transactions,
      debts,
      items,
      taxRuns,
      reportSnapshots,
      auditLogs,
    },
  };
}

export async function validateRestoreBackup(userId: string, body: unknown, businessId?: string) {
  const access = await requireBusinessAccess(userId, "admin", businessId);
  const parsed = restoreBackupRequestSchema.parse(body);
  const backup = parsed.backup;

  await getPrisma().auditLog.create({
    data: {
      businessId: access.businessId,
      actorId: userId,
      action: "backup.restore_validated",
      message: `Restore file for ${backup.business.name} was validated without changing live data.`,
      metadata: {
        accounts: backup.business.accounts.length,
        transactions: backup.business.transactions.length,
        customers: backup.business.customers.length,
        suppliers: backup.business.suppliers.length,
        debts: backup.business.debts.length,
        items: backup.business.items.length,
      },
    },
  });

  return {
    ok: true,
    message: "Backup structure is valid. Restore remains manual until an owner approves a downtime window.",
  };
}

function mapInvitation(
  invitation: {
    id: string;
    email: string;
    role: Role;
    token: string;
    acceptedAt: Date | null;
    revokedAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
  },
  options: { includeToken?: boolean } = {},
) {
  return {
    id: invitation.id,
    email: invitation.email,
    role: mapRole(invitation.role),
    token: options.includeToken ? invitation.token : undefined,
    acceptedAt: invitation.acceptedAt?.toISOString(),
    revokedAt: invitation.revokedAt?.toISOString(),
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
    status: invitation.acceptedAt
      ? "accepted"
      : invitation.revokedAt
        ? "revoked"
        : invitation.expiresAt <= new Date()
          ? "expired"
          : "pending",
  };
}
