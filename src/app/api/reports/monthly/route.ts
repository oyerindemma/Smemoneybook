import { requireUser } from "@/lib/auth/session";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { parseReportPeriod } from "@/lib/api/validation";
import { getMonthlyReportForUser } from "@/lib/bookkeeping/persistence";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { month, year, period, date } = getReportPeriod(request);
    const report = await getMonthlyReportForUser({
      userId: user.id,
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
  const { month, year } = parseReportPeriod(request);
  return { month, year };
}

export function getReportPeriod(request: Request) {
  return parseReportPeriod(request);
}
