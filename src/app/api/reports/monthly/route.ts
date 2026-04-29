import { requireUser } from "@/lib/auth/session";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { parseMonthYear } from "@/lib/api/validation";
import { getMonthlyReportForUser } from "@/lib/bookkeeping/persistence";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { month, year } = getMonthYear(request);
    const report = await getMonthlyReportForUser({ userId: user.id, month, year });

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
  return parseMonthYear(request);
}
