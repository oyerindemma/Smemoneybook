import { Prisma } from "@prisma/client";
import { jsonError } from "@/lib/api/http";
import { getPrisma } from "@/lib/prisma";
import {
  PredictiveAlertsAccessError,
  type PredictiveAlertsAccess,
} from "@/lib/predictive-alerts/authorization";
import type {
  PredictiveAlertLifecycleStatus,
  PredictiveAlertSeverity,
} from "@/lib/predictive-alerts/definitions";

export class PredictiveAlertsDomainError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "predictive_alerts_invalid") {
    super(message);
    this.name = "PredictiveAlertsDomainError";
    this.status = status;
    this.code = code;
  }
}

export function parsePredictiveAlertsRequest(url: string) {
  const searchParams = new URL(url).searchParams;
  return {
    businessId: searchParams.get("businessId")?.trim() ?? "",
    locationId: searchParams.get("locationId")?.trim() || undefined,
    statuses: readStatuses(searchParams.get("status")),
    severity: readSeverity(searchParams.get("severity")),
    category: searchParams.get("category")?.trim() || undefined,
    periodDays: readPeriodDays(searchParams.get("periodDays")),
  };
}

export function predictiveAlertsMethodNotAllowed(allow = "GET") {
  return Response.json(
    { error: "Method not allowed." },
    {
      status: 405,
      headers: { Allow: allow },
    },
  );
}

export function predictiveAlertsErrorResponse(error: unknown, fallback: string) {
  if (error instanceof PredictiveAlertsAccessError || error instanceof PredictiveAlertsDomainError) {
    return jsonError(error.message, error.status);
  }

  if (error instanceof Response) {
    return jsonError(error.statusText || fallback, error.status);
  }

  console.error("predictive_alerts.request_failed", error);
  return jsonError(fallback, 500);
}

export async function logPredictiveAlertsAudit({
  access,
  action,
  metadata = {},
}: {
  access: PredictiveAlertsAccess;
  action:
    | "predictive_alerts.evaluation_run"
    | "predictive_alerts.alert_created"
    | "predictive_alerts.alert_updated"
    | "predictive_alerts.acknowledged"
    | "predictive_alerts.dismissed"
    | "predictive_alerts.reopened"
    | "predictive_alerts.preference_changed"
    | "predictive_alerts.export_generated"
    | "predictive_alerts.delivery_attempted";
  metadata?: Record<string, unknown>;
}) {
  await getPrisma().auditLog.create({
    data: {
      businessId: access.businessId,
      actorId: access.userId,
      action,
      message: predictiveAlertsAuditMessage(action),
      metadata: {
        feature: "phase3e_predictive_alerts",
        locationId: access.locationId ?? null,
        ...metadata,
      } as Prisma.InputJsonObject,
    },
  }).catch(() => undefined);
}

function predictiveAlertsAuditMessage(action: string) {
  if (action === "predictive_alerts.evaluation_run") {
    return "Predictive Alerts evaluation run.";
  }

  if (action === "predictive_alerts.preference_changed") {
    return "Predictive Alerts preference changed.";
  }

  if (action === "predictive_alerts.export_generated") {
    return "Predictive Alerts export generated.";
  }

  if (action === "predictive_alerts.delivery_attempted") {
    return "Predictive Alerts delivery attempted.";
  }

  if (action === "predictive_alerts.acknowledged") {
    return "Predictive Alert acknowledged.";
  }

  if (action === "predictive_alerts.dismissed") {
    return "Predictive Alert dismissed.";
  }

  if (action === "predictive_alerts.reopened") {
    return "Predictive Alert reopened.";
  }

  if (action === "predictive_alerts.alert_updated") {
    return "Predictive Alert updated.";
  }

  return "Predictive Alert created.";
}

function readStatuses(value: string | null): PredictiveAlertLifecycleStatus[] {
  if (!value) {
    return ["active", "acknowledged"];
  }

  const allowed = new Set<PredictiveAlertLifecycleStatus>(["active", "acknowledged", "resolved", "dismissed"]);
  const statuses = value
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is PredictiveAlertLifecycleStatus => allowed.has(item as PredictiveAlertLifecycleStatus));

  return statuses.length ? statuses : ["active", "acknowledged"];
}

function readSeverity(value: string | null): PredictiveAlertSeverity | undefined {
  if (
    value === "critical" ||
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "information"
  ) {
    return value;
  }

  return undefined;
}

function readPeriodDays(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(14, Math.min(30, parsed)) : undefined;
}
