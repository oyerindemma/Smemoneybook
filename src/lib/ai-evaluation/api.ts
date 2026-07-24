import { Prisma } from "@prisma/client";
import { jsonError } from "@/lib/api/http";
import { getPrisma } from "@/lib/prisma";
import {
  AiEvaluationAccessError,
  type AiEvaluationAccess,
} from "@/lib/ai-evaluation/authorization";
import {
  aiEvaluationTargetFeatures,
  type AiEvaluationPermission,
  type AiEvaluationTargetFeature,
} from "@/lib/ai-evaluation/definitions";

export class AiEvaluationDomainError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "ai_evaluation_invalid") {
    super(message);
    this.name = "AiEvaluationDomainError";
    this.status = status;
    this.code = code;
  }
}

export function parseAiEvaluationBusinessRequest(url: string) {
  const searchParams = new URL(url).searchParams;
  return {
    businessId: searchParams.get("businessId")?.trim() ?? "",
  };
}

export function parseAiEvaluationListRequest(url: string) {
  const searchParams = new URL(url).searchParams;
  return {
    businessId: searchParams.get("businessId")?.trim() ?? "",
    targetFeature: readTargetFeature(searchParams.get("targetFeature")),
    status: searchParams.get("status")?.trim() || undefined,
    limit: readLimit(searchParams.get("limit")),
  };
}

export function parseAiEvaluationCompareRequest(url: string) {
  const searchParams = new URL(url).searchParams;
  return {
    businessId: searchParams.get("businessId")?.trim() ?? "",
    leftRunId: searchParams.get("leftRunId")?.trim() ?? "",
    rightRunId: searchParams.get("rightRunId")?.trim() ?? "",
  };
}

export function aiEvaluationMethodNotAllowed(allow = "GET") {
  return Response.json(
    { error: "Method not allowed." },
    {
      status: 405,
      headers: { Allow: allow },
    },
  );
}

export function aiEvaluationErrorResponse(error: unknown, fallback: string) {
  if (error instanceof AiEvaluationAccessError || error instanceof AiEvaluationDomainError) {
    return jsonError(error.message, error.status);
  }

  if (error instanceof Response) {
    return jsonError(error.statusText || "Sign in to continue.", error.status);
  }

  console.error("ai_evaluation.request_failed", error);
  return jsonError(fallback, 500);
}

export async function logAiEvaluationAudit({
  access,
  action,
  metadata = {},
}: {
  access: AiEvaluationAccess;
  action:
    | "ai_evaluation.suite_created"
    | "ai_evaluation.case_added"
    | "ai_evaluation.run_started"
    | "ai_evaluation.run_cancelled"
    | "ai_evaluation.run_completed"
    | "ai_evaluation.baseline_accepted"
    | "ai_evaluation.report_exported"
    | "ai_evaluation.provider_model_changed"
    | "ai_evaluation.threshold_changed";
  metadata?: Record<string, unknown>;
}) {
  await getPrisma().auditLog.create({
    data: {
      businessId: access.businessId,
      actorId: access.userId,
      action,
      message: aiEvaluationAuditMessage(action),
      metadata: {
        feature: "phase3f_ai_evaluation",
        role: access.role,
        internalAdmin: access.isInternalAdmin,
        ...metadata,
      } as Prisma.InputJsonObject,
    },
  }).catch(() => undefined);
}

export function capabilityPayload(access: AiEvaluationAccess) {
  return {
    canRead: access.canRead,
    canRun: access.canRun,
    canManageCases: access.canManageCases,
    canExport: access.canExport,
    canCompareModels: access.canCompareModels,
    internalAdmin: access.isInternalAdmin,
  };
}

export function permissionForAction(action: "read" | "run" | "manage_cases" | "export" | "compare"): AiEvaluationPermission {
  return `ai_evaluation:${action === "manage_cases" ? "manage_cases" : action === "compare" ? "compare_models" : action}` as AiEvaluationPermission;
}

function aiEvaluationAuditMessage(action: string) {
  if (action === "ai_evaluation.suite_created") {
    return "AI evaluation suite created.";
  }

  if (action === "ai_evaluation.case_added") {
    return "AI evaluation case added.";
  }

  if (action === "ai_evaluation.run_started") {
    return "AI evaluation run started.";
  }

  if (action === "ai_evaluation.run_cancelled") {
    return "AI evaluation run cancelled.";
  }

  if (action === "ai_evaluation.run_completed") {
    return "AI evaluation run completed.";
  }

  if (action === "ai_evaluation.baseline_accepted") {
    return "AI evaluation baseline accepted.";
  }

  if (action === "ai_evaluation.report_exported") {
    return "AI evaluation report exported.";
  }

  if (action === "ai_evaluation.provider_model_changed") {
    return "AI evaluation provider or model changed.";
  }

  return "AI evaluation threshold changed.";
}

function readTargetFeature(value: string | null): AiEvaluationTargetFeature | undefined {
  if (!value) {
    return undefined;
  }

  return aiEvaluationTargetFeatures.includes(value as AiEvaluationTargetFeature)
    ? value as AiEvaluationTargetFeature
    : undefined;
}

function readLimit(value: string | null) {
  const parsed = value ? Number.parseInt(value, 10) : 50;
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 50;
}
