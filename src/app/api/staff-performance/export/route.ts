import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireStaffPerformanceAccess } from "@/lib/staff-performance/authorization";
import {
  logStaffPerformanceReportEvent,
  parseStaffPerformanceRequest,
  staffPerformanceErrorResponse,
} from "@/lib/staff-performance/api";
import {
  staffPerformanceCsvFilename,
  staffPerformanceSummaryToCsv,
} from "@/lib/staff-performance/export";
import { getStaffPerformanceSummary } from "@/lib/staff-performance/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "staff_performance.export", 20, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseStaffPerformanceRequest(request.url);
    const access = await requireStaffPerformanceAccess({
      userId: user.id,
      businessId: filters.businessId,
      locationId: filters.locationId,
      permission: "staff_performance:export",
    });
    const summary = await getStaffPerformanceSummary({
      businessId: access.businessId,
      locationId: access.locationId,
      period: filters.period,
    });

    if (summary.rows.length > 500) {
      return Response.json(
        { error: "Narrow the report before exporting more than 500 staff rows." },
        { status: 413 },
      );
    }

    await logStaffPerformanceReportEvent({
      access,
      action: "staff_performance.report_exported",
      period: filters.period,
      locationId: access.locationId,
    });

    return new Response(staffPerformanceSummaryToCsv(summary), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${staffPerformanceCsvFilename(summary)}"`,
      },
    });
  } catch (error) {
    return staffPerformanceErrorResponse(error, "Could not export staff performance.");
  }
}
