import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { parseReportPeriod } from "@/lib/api/validation";
import { getMonthlyReportForUser } from "@/lib/bookkeeping/persistence";
import { requireFeatureAccess } from "@/lib/billing/subscriptions";
import { requireBusinessAccess } from "@/lib/operations/access";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "reports.monthly.read", 120, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const { businessId, locationId, month, year, period, date } = getReportPeriod(request);
    const now = new Date();
    const isCurrentMonthPreview =
      period === "month" &&
      month === now.getMonth() + 1 &&
      year === now.getFullYear();

    if (!isCurrentMonthPreview) {
      const access = await requireBusinessAccess(user.id, "reports:write", businessId);
      const gated = await requireFeatureAccess(user.id, access.businessId, "basic_exports");

      if (gated) {
        return gated;
      }
    }

    const report = await getMonthlyReportForUser({
      userId: user.id,
      businessId,
      locationId,
      month,
      year,
      period,
      date,
    });

    if (!report) {
      return jsonError("Create a business to see monthly reports.", 404);
    }

    return Response.json({ report });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not load monthly report.");
  }
}

export function getMonthYear(request: Request) {
  const { businessId, locationId, month, year } = parseReportPeriod(request);
  return { businessId, locationId, month, year };
}

export function getReportPeriod(request: Request) {
  return parseReportPeriod(request);
}
