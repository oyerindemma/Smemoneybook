import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { saveReportSnapshotForUser } from "@/lib/bookkeeping/persistence";
import { requireFeatureAccess } from "@/lib/billing/subscriptions";
import { requireBusinessAccess } from "@/lib/operations/access";
import { getReportPeriod } from "@/app/api/reports/monthly/route";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "reports.snapshots.write", 40, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const { businessId, month, year, period, date } = getReportPeriod(request);
    const access = await requireBusinessAccess(user.id, "reports:write", businessId);
    const gated = await requireFeatureAccess(user.id, access.businessId, "basic_exports");

    if (gated) {
      return gated;
    }

    const report = await saveReportSnapshotForUser({
      userId: user.id,
      businessId: access.businessId,
      month,
      year,
      period,
      date,
    });

    return Response.json({ report, message: "Report snapshot saved." });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not save report snapshot.");
  }
}
