import { Role } from "@prisma/client";
import { getActiveBillingPlan } from "@/lib/billing/subscriptions";
import { hasPermission } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";
import {
  readAiEvaluationFlag,
  type AiEvaluationPermission,
} from "@/lib/ai-evaluation/definitions";

export type AiEvaluationAccess = {
  businessId: string;
  businessName: string;
  currency: string;
  userId: string;
  email: string;
  role: Role | "INTERNAL_ADMIN";
  isInternalAdmin: boolean;
  canRead: boolean;
  canRun: boolean;
  canManageCases: boolean;
  canExport: boolean;
  canCompareModels: boolean;
};

export class AiEvaluationAccessError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "AiEvaluationAccessError";
    this.status = status;
    this.code = code;
  }
}

export function isAiEvaluationFeatureEnabledForServer() {
  return (
    !readAiEvaluationFlag(process.env.PHASE3_AI_GLOBAL_KILL_SWITCH, false) &&
    readAiEvaluationFlag(process.env.NEXT_PUBLIC_PHASE3_AI_EVALUATION_ENABLED, false) &&
    readAiEvaluationFlag(process.env.PHASE3_AI_EVALUATION_ENABLED, false)
  );
}

export function aiEvaluationFeatureUnavailableError() {
  return new AiEvaluationAccessError(
    "AI Evaluation is unavailable in this environment.",
    503,
    "feature_disabled",
  );
}

export async function requireAiEvaluationAccess({
  user,
  businessId,
  permission,
}: {
  user: { id: string; email: string };
  businessId: string;
  permission: AiEvaluationPermission;
}): Promise<AiEvaluationAccess> {
  if (!isAiEvaluationFeatureEnabledForServer()) {
    throw aiEvaluationFeatureUnavailableError();
  }

  if (!businessId) {
    throw new AiEvaluationAccessError("Choose a business before opening AI Evaluation.", 400, "business_required");
  }

  const prisma = getPrisma();
  const internalAdmin = isAiEvaluationInternalAdmin(user.email);
  const membership = await prisma.businessMember.findFirst({
    where: { userId: user.id, businessId },
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

  if (!membership && !internalAdmin) {
    throw new AiEvaluationAccessError("You do not have access to this business.", 403, "business_access_denied");
  }

  const business = membership?.business ?? await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, name: true, currency: true },
  });

  if (!business) {
    throw new AiEvaluationAccessError("Choose a valid business.", 404, "business_not_found");
  }

  if (!internalAdmin) {
    const plan = await getActiveBillingPlan(user.id, business.id);

    if (!plan || plan.id !== "pro" || !plan.features.includes("ai_evaluation")) {
      throw new AiEvaluationAccessError("Upgrade to Pro to use AI Evaluation.", 402, "upgrade_required");
    }
  }

  const role = membership?.role ?? "INTERNAL_ADMIN";
  const grant = await getAiEvaluationPermissionGrant({
    businessId: business.id,
    userId: user.id,
    role,
    permission,
    internalAdmin,
  });

  if (!grant.allowed) {
    throw new AiEvaluationAccessError(grant.reason, 403, "permission_denied");
  }

  const [runGrant, manageGrant, exportGrant, compareGrant] = await Promise.all([
    getAiEvaluationPermissionGrant({
      businessId: business.id,
      userId: user.id,
      role,
      permission: "ai_evaluation:run",
      internalAdmin,
    }),
    getAiEvaluationPermissionGrant({
      businessId: business.id,
      userId: user.id,
      role,
      permission: "ai_evaluation:manage_cases",
      internalAdmin,
    }),
    getAiEvaluationPermissionGrant({
      businessId: business.id,
      userId: user.id,
      role,
      permission: "ai_evaluation:export",
      internalAdmin,
    }),
    getAiEvaluationPermissionGrant({
      businessId: business.id,
      userId: user.id,
      role,
      permission: "ai_evaluation:compare_models",
      internalAdmin,
    }),
  ]);

  return {
    businessId: business.id,
    businessName: business.name,
    currency: business.currency,
    userId: user.id,
    email: user.email,
    role,
    isInternalAdmin: internalAdmin,
    canRead: true,
    canRun: runGrant.allowed,
    canManageCases: manageGrant.allowed,
    canExport: exportGrant.allowed,
    canCompareModels: compareGrant.allowed,
  };
}

async function getAiEvaluationPermissionGrant({
  businessId,
  userId,
  role,
  permission,
  internalAdmin,
}: {
  businessId: string;
  userId: string;
  role: Role | "INTERNAL_ADMIN";
  permission: AiEvaluationPermission;
  internalAdmin: boolean;
}) {
  if (internalAdmin) {
    return { allowed: true, reason: "" };
  }

  if (role !== "INTERNAL_ADMIN" && hasPermission(role, permission)) {
    return { allowed: true, reason: "" };
  }

  if (role === Role.ACCOUNTANT || role === Role.STAFF) {
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
  }

  return { allowed: false, reason: permissionDeniedMessage(permission) };
}

function permissionDeniedMessage(permission: AiEvaluationPermission) {
  if (permission === "ai_evaluation:run") {
    return "You do not have permission to run AI evaluations.";
  }

  if (permission === "ai_evaluation:manage_cases") {
    return "You do not have permission to manage AI evaluation cases.";
  }

  if (permission === "ai_evaluation:export") {
    return "You do not have permission to export AI evaluation reports.";
  }

  if (permission === "ai_evaluation:compare_models") {
    return "You do not have permission to compare AI evaluation runs.";
  }

  return "You do not have permission to view AI Evaluation.";
}

export function isAiEvaluationInternalAdmin(email: string) {
  const configuredAdmins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return configuredAdmins.includes(email.toLowerCase());
}
