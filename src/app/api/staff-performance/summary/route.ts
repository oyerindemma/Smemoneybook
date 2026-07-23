import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireStaffPerformanceAccess } from "@/lib/staff-performance/authorization";
import {
  logStaffPerformanceReportEvent,
  parseStaffPerformanceRequest,
  staffPerformanceErrorResponse,
} from "@/lib/staff-performance/api";
import { getStaffPerformanceSummary } from "@/lib/staff-performance/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "staff_performance.summary", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseStaffPerformanceRequest(request.url);
    const access = await requireStaffPerformanceAccess({
      userId: user.id,
      businessId: filters.businessId,
      locationId: filters.locationId,
      permission: "staff_performance:read",
    });
    const summary = await getStaffPerformanceSummary({
      businessId: access.businessId,
      locationId: access.locationId,
      period: filters.period,
    });

    await logStaffPerformanceReportEvent({
      access,
      action: "staff_performance.report_viewed",
      period: filters.period,
      locationId: access.locationId,
    });

    return Response.json({ summary });
  } catch (error) {
    return staffPerformanceErrorResponse(error, "Could not load staff performance.");
  }
}
