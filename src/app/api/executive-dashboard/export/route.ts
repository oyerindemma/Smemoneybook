import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import {
  executiveDashboardErrorResponse,
  executiveDashboardMethodNotAllowed,
  logExecutiveDashboardAudit,
  parseExecutiveDashboardRequest,
} from "@/lib/executive-dashboard/api";
import { requireExecutiveDashboardAccess } from "@/lib/executive-dashboard/authorization";
import {
  executiveDashboardCsvFilename,
  executiveDashboardToCsv,
} from "@/lib/executive-dashboard/export";
import { getExecutiveDashboardSummary } from "@/lib/executive-dashboard/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "executive_dashboard.export", 30, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseExecutiveDashboardRequest(request.url);
    const access = await requireExecutiveDashboardAccess({
      userId: user.id,
      businessId: filters.businessId,
      locationId: filters.locationId,
      permission: "executive_dashboard:export",
    });
    const dashboard = await getExecutiveDashboardSummary({
      businessId: access.businessId,
      locationId: access.locationId,
      period: filters.period,
      includeStaffSummary: access.canViewStaffSummary,
    });
    const csv = executiveDashboardToCsv({
      summary: dashboard,
      generatedBy: user.email,
    });

    await logExecutiveDashboardAudit({
      access,
      action: "executive_dashboard.export_generated",
      periodStart: dashboard.period.start,
      periodEnd: dashboard.period.end,
      metadata: { metricVersion: dashboard.metricVersion },
    });

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${executiveDashboardCsvFilename(dashboard)}"`,
      },
    });
  } catch (error) {
    return executiveDashboardErrorResponse(error, "Could not export Executive Dashboard.");
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
