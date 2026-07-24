import { assertSameOriginRequest } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import {
  executiveDashboardErrorResponse,
  executiveDashboardMethodNotAllowed,
  logExecutiveDashboardAudit,
  parseExecutiveDashboardRequest,
} from "@/lib/executive-dashboard/api";
import { requireExecutiveDashboardAccess } from "@/lib/executive-dashboard/authorization";
import { getExecutiveDashboardSummary } from "@/lib/executive-dashboard/service";

export const runtime = "nodejs";

export function GET() {
  return executiveDashboardMethodNotAllowed("POST");
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "executive_dashboard.refresh", 30, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseExecutiveDashboardRequest(request.url);
    const access = await requireExecutiveDashboardAccess({
      userId: user.id,
      businessId: filters.businessId,
      locationId: filters.locationId,
      permission: "executive_dashboard:read",
    });
    const dashboard = await getExecutiveDashboardSummary({
      businessId: access.businessId,
      locationId: access.locationId,
      period: filters.period,
      includeStaffSummary: access.canViewStaffSummary,
    });

    await logExecutiveDashboardAudit({
      access,
      action: "executive_dashboard.refresh_requested",
      periodStart: dashboard.period.start,
      periodEnd: dashboard.period.end,
      metadata: { metricVersion: dashboard.metricVersion },
    });

    return Response.json({ dashboard, message: "Executive Dashboard refreshed." });
  } catch (error) {
    return executiveDashboardErrorResponse(error, "Could not refresh Executive Dashboard.");
  }
}

export function PUT() {
  return executiveDashboardMethodNotAllowed("POST");
}

export function PATCH() {
  return executiveDashboardMethodNotAllowed("POST");
}

export function DELETE() {
  return executiveDashboardMethodNotAllowed("POST");
}
