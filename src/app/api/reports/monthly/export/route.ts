import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { requireFeatureAccess } from "@/lib/billing/subscriptions";
import { getMonthlyReportForUser } from "@/lib/bookkeeping/persistence";
import { requireBusinessAccess } from "@/lib/operations/access";
import { monthlyReportToCsv } from "@/lib/reports/csv";
import { reportToPdf } from "@/lib/reports/pdf";
import { getReportPeriod } from "@/app/api/reports/monthly/route";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "reports.monthly.export", 40, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const { businessId, locationId, month, year, period, date } = getReportPeriod(request);
    const access = await requireBusinessAccess(user.id, undefined, businessId);
    const gated = await requireFeatureAccess(user.id, access.businessId, "basic_exports");

    if (gated) {
      return gated;
    }

    const report = await getMonthlyReportForUser({
      userId: user.id,
      businessId: access.businessId,
      locationId,
      month,
      year,
      period,
      date,
    });

    if (!report) {
      return jsonError("Create a business to export reports.", 404);
    }

    const url = new URL(request.url);
    const format = url.searchParams.get("format") ?? "csv";

    if (format === "pdf") {
      return new Response(reportToPdf(report), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="moneybook-${report.period}-${report.periodLabel}.pdf"`,
        },
      });
    }

    return new Response(monthlyReportToCsv(report), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="moneybook-${report.period}-${report.periodLabel}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not export monthly report.");
  }
}
