import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import {
  assertStaffMemberBelongsToBusiness,
  requireStaffPerformanceAccess,
} from "@/lib/staff-performance/authorization";
import {
  logStaffPerformanceReportEvent,
  parseStaffPerformanceRequest,
  staffPerformanceErrorResponse,
} from "@/lib/staff-performance/api";
import { getStaffPerformanceDetail } from "@/lib/staff-performance/service";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ staffId: string }> },
) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "staff_performance.detail", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const { staffId } = await params;
    const filters = parseStaffPerformanceRequest(request.url);
    const access = await requireStaffPerformanceAccess({
      userId: user.id,
      businessId: filters.businessId,
      locationId: filters.locationId,
      permission: "staff_performance:read",
    });

    await assertStaffMemberBelongsToBusiness({
      businessId: access.businessId,
      staffId,
    });

    const detail = await getStaffPerformanceDetail({
      businessId: access.businessId,
      staffId,
      locationId: access.locationId,
      period: filters.period,
    });

    await logStaffPerformanceReportEvent({
      access,
      action: "staff_performance.report_viewed",
      period: filters.period,
      locationId: access.locationId,
      targetStaffId: staffId,
    });

    return Response.json(detail);
  } catch (error) {
    return staffPerformanceErrorResponse(error, "Could not load staff details.");
  }
}
