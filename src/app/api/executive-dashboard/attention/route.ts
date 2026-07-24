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

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "executive_dashboard.attention", 80, 15 * 60 * 1000);

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
      action: "executive_dashboard.viewed",
      periodStart: dashboard.period.start,
      periodEnd: dashboard.period.end,
      metadata: { surface: "attention" },
    });

    return Response.json({
      attention: dashboard.attentionQueue,
      dataQuality: dashboard.dataQuality,
      period: dashboard.period,
      generatedAt: dashboard.generatedAt,
    });
  } catch (error) {
    return executiveDashboardErrorResponse(error, "Could not load Executive Dashboard attention items.");
  }
}

export function POST() {
  return executiveDashboardMethodNotAllowed();
}

export function PUT() {
  return executiveDashboardMethodNotAllowed();
}

export function PATCH() {
  return executiveDashboardMethodNotAllowed();
}

export function DELETE() {
  return executiveDashboardMethodNotAllowed();
}
