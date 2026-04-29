import { requireUser } from "@/lib/auth/session";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { getMonthlyReportForUser } from "@/lib/bookkeeping/persistence";
import { monthlyReportToCsv } from "@/lib/reports/csv";
import { getMonthYear } from "@/app/api/reports/monthly/route";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { month, year } = getMonthYear(request);
    const report = await getMonthlyReportForUser({ userId: user.id, month, year });

    if (!report) {
      return jsonError("Create a business to export reports.", 404);
    }

    return new Response(monthlyReportToCsv(report), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="moneybook-${year}-${String(month).padStart(2, "0")}.csv"`,
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
