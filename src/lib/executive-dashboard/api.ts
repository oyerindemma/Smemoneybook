import { Prisma } from "@prisma/client";
import { jsonError } from "@/lib/api/http";
import { getPrisma } from "@/lib/prisma";
import { ExecutiveDashboardAccessError, type ExecutiveDashboardAccess } from "@/lib/executive-dashboard/authorization";
import { executiveDashboardDrilldownTypes, type ExecutiveDashboardDrilldownType } from "@/lib/executive-dashboard/definitions";
import { resolveExecutiveDashboardPeriod } from "@/lib/executive-dashboard/service";

export class ExecutiveDashboardDomainError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "executive_dashboard_invalid") {
    super(message);
    this.name = "ExecutiveDashboardDomainError";
    this.status = status;
    this.code = code;
  }
}

export function parseExecutiveDashboardRequest(url: string) {
  const searchParams = new URL(url).searchParams;
  const businessId = searchParams.get("businessId")?.trim() ?? "";
  const locationId = searchParams.get("locationId")?.trim() || undefined;
  const period = resolveExecutiveDashboardPeriod({
    preset: searchParams.get("preset"),
    from: searchParams.get("from"),
    to: searchParams.get("to"),
  });

  return { businessId, locationId, period };
}

export function parseExecutiveDashboardDrilldownType(url: string): ExecutiveDashboardDrilldownType {
  const type = new URL(url).searchParams.get("type")?.trim() as ExecutiveDashboardDrilldownType | undefined;

  if (!type || !executiveDashboardDrilldownTypes.includes(type)) {
    throw new ExecutiveDashboardDomainError("Choose a valid Executive Dashboard drill-down type.", 400, "invalid_drilldown_type");
  }

  return type;
}

export function executiveDashboardMethodNotAllowed(allow = "GET") {
  return Response.json(
    { error: "Method not allowed." },
    {
      status: 405,
      headers: { Allow: allow },
    },
  );
}

export function executiveDashboardErrorResponse(error: unknown, fallback: string) {
  if (error instanceof ExecutiveDashboardAccessError || error instanceof ExecutiveDashboardDomainError) {
    return jsonError(error.message, error.status);
  }

  if (error instanceof Response) {
    return jsonError(error.statusText || fallback, error.status);
  }

  console.error("executive_dashboard.request_failed", error);
  return jsonError(fallback, 500);
}

export async function logExecutiveDashboardAudit({
  access,
  action,
  periodStart,
  periodEnd,
  metadata = {},
}: {
  access: ExecutiveDashboardAccess;
  action:
    | "executive_dashboard.viewed"
    | "executive_dashboard.period_changed"
    | "executive_dashboard.drilldown_opened"
    | "executive_dashboard.export_generated"
    | "executive_dashboard.refresh_requested";
  periodStart: string;
  periodEnd: string;
  metadata?: Record<string, unknown>;
}) {
  await getPrisma().auditLog.create({
    data: {
      businessId: access.businessId,
      actorId: access.userId,
      action,
      message: executiveDashboardAuditMessage(action),
      metadata: {
        feature: "phase3_executive_dashboard",
        locationId: access.locationId ?? null,
        periodStart,
        periodEnd,
        ...metadata,
      } as Prisma.InputJsonObject,
    },
  }).catch(() => undefined);
}

function executiveDashboardAuditMessage(action: string) {
  if (action === "executive_dashboard.export_generated") {
    return "Executive Dashboard export generated.";
  }

  if (action === "executive_dashboard.drilldown_opened") {
    return "Executive Dashboard drill-down opened.";
  }

  if (action === "executive_dashboard.refresh_requested") {
    return "Executive Dashboard refresh requested.";
  }

  if (action === "executive_dashboard.period_changed") {
    return "Executive Dashboard period changed.";
  }

  return "Executive Dashboard viewed.";
}
