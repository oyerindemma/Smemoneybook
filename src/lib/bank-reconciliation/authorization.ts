import { Role } from "@prisma/client";
import { getActiveBillingPlan } from "@/lib/billing/subscriptions";
import { hasPermission } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";
import type { BankReconciliationPermission } from "@/lib/bank-reconciliation/definitions";

export type BankReconciliationAccess = {
  businessId: string;
  businessName: string;
  currency: string;
  userId: string;
  role: Role;
  locationId?: string;
  locationName?: string;
};

export class BankReconciliationAccessError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "BankReconciliationAccessError";
    this.status = status;
    this.code = code;
  }
}

export function isBankReconciliationFeatureEnabledForServer() {
  return (
    !readFlag(process.env.PHASE3_AI_GLOBAL_KILL_SWITCH, false) &&
    readFlag(process.env.NEXT_PUBLIC_PHASE3_BANK_RECONCILIATION_ENABLED, false) &&
    readFlag(process.env.PHASE3_BANK_RECONCILIATION_ENABLED, false)
  );
}

export function bankReconciliationFeatureUnavailableError() {
  return new BankReconciliationAccessError(
    "Bank Reconciliation is unavailable in this environment.",
    503,
    "feature_disabled",
  );
}

export async function requireBankReconciliationAccess({
  userId,
  businessId,
  permission,
  locationId,
}: {
  userId: string;
  businessId: string;
  permission: BankReconciliationPermission;
  locationId?: string;
}): Promise<BankReconciliationAccess> {
  if (!isBankReconciliationFeatureEnabledForServer()) {
    throw bankReconciliationFeatureUnavailableError();
  }

  if (!businessId) {
    throw new BankReconciliationAccessError(
      "Choose a business before opening Bank Reconciliation.",
      400,
      "business_required",
    );
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
    throw new BankReconciliationAccessError(
      "You do not have access to this business.",
      403,
      "business_access_denied",
    );
  }

  const plan = await getActiveBillingPlan(userId, membership.businessId);

  if (!plan || !["growth", "pro"].includes(plan.id) || !plan.features.includes("bank_reconciliation")) {
    throw new BankReconciliationAccessError(
      "Upgrade to Growth to use Bank Reconciliation.",
      402,
      "upgrade_required",
    );
  }

  const permissionGrant = await getBankReconciliationPermissionGrant({
    businessId: membership.businessId,
    userId,
    role: membership.role,
    permission,
    locationId,
  });

  if (!permissionGrant.allowed) {
    throw new BankReconciliationAccessError(
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
    throw new BankReconciliationAccessError("Choose a valid business location.", 400, "location_invalid");
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
      throw new BankReconciliationAccessError(
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

export async function assertBankStatementImportBelongsToBusiness({
  businessId,
  importId,
}: {
  businessId: string;
  importId: string;
}) {
  const statementImport = await getPrisma().bankStatementImport.findFirst({
    where: { id: importId, businessId },
    select: { id: true },
  });

  if (!statementImport) {
    throw new BankReconciliationAccessError(
      "Choose a valid bank statement import.",
      404,
      "import_not_found",
    );
  }
}

export async function assertBankStatementEntryBelongsToBusiness({
  businessId,
  entryId,
}: {
  businessId: string;
  entryId: string;
}) {
  const entry = await getPrisma().bankStatementImportRow.findFirst({
    where: { id: entryId, businessId },
    select: { id: true },
  });

  if (!entry) {
    throw new BankReconciliationAccessError(
      "Choose a valid bank statement entry.",
      404,
      "entry_not_found",
    );
  }
}

export async function assertBankReconciliationMatchBelongsToBusiness({
  businessId,
  matchId,
}: {
  businessId: string;
  matchId: string;
}) {
  const match = await getPrisma().bankReconciliationMatch.findFirst({
    where: { id: matchId, businessId },
    select: { id: true },
  });

  if (!match) {
    throw new BankReconciliationAccessError(
      "Choose a valid reconciliation match.",
      404,
      "match_not_found",
    );
  }
}

async function getBankReconciliationPermissionGrant({
  businessId,
  userId,
  role,
  permission,
  locationId,
}: {
  businessId: string;
  userId: string;
  role: Role;
  permission: BankReconciliationPermission;
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

function permissionReason(permission: BankReconciliationPermission) {
  if (permission === "bank_reconciliation:export") {
    return "You do not have permission to export Bank Reconciliation reports.";
  }

  if (permission === "bank_reconciliation:import") {
    return "You do not have permission to import bank statements.";
  }

  if (permission === "bank_reconciliation:match") {
    return "You do not have permission to match bank statement entries.";
  }

  if (permission === "bank_reconciliation:ignore") {
    return "You do not have permission to ignore bank statement entries.";
  }

  return "You do not have permission to view Bank Reconciliation.";
}

function readFlag(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
