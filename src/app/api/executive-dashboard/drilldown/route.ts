import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import {
  executiveDashboardErrorResponse,
  executiveDashboardMethodNotAllowed,
  logExecutiveDashboardAudit,
  parseExecutiveDashboardDrilldownType,
  parseExecutiveDashboardRequest,
} from "@/lib/executive-dashboard/api";
import { requireExecutiveDashboardAccess } from "@/lib/executive-dashboard/authorization";
import { getExecutiveDashboardDrilldown } from "@/lib/executive-dashboard/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "executive_dashboard.drilldown", 120, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseExecutiveDashboardRequest(request.url);
    const type = parseExecutiveDashboardDrilldownType(request.url);
    const access = await requireExecutiveDashboardAccess({
      userId: user.id,
      businessId: filters.businessId,
      locationId: filters.locationId,
      permission: type === "staff" ? "executive_dashboard:view_staff_summary" : "executive_dashboard:read",
    });
    const drilldown = await getExecutiveDashboardDrilldown({
      businessId: access.businessId,
      locationId: access.locationId,
      period: filters.period,
      type,
      includeStaffSummary: access.canViewStaffSummary,
    });

    await logExecutiveDashboardAudit({
      access,
      action: "executive_dashboard.drilldown_opened",
      periodStart: drilldown.period.start,
      periodEnd: drilldown.period.end,
      metadata: { drilldownType: type },
    });

    return Response.json({ drilldown });
  } catch (error) {
    return executiveDashboardErrorResponse(error, "Could not load Executive Dashboard drill-down.");
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
