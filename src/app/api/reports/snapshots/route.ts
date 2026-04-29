import { requireUser } from "@/lib/auth/session";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { saveReportSnapshotForUser } from "@/lib/bookkeeping/persistence";
import { getReportPeriod } from "@/app/api/reports/monthly/route";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { month, year, period, date } = getReportPeriod(request);
    const report = await saveReportSnapshotForUser({
      userId: user.id,
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
