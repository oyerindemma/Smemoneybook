import { requireUser } from "@/lib/auth/session";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { saveTaxRunForUser } from "@/lib/bookkeeping/persistence";
import { getMonthYear } from "@/app/api/reports/monthly/route";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { businessId, month, year } = getMonthYear(request);
    const report = await saveTaxRunForUser({ userId: user.id, businessId, month, year });

    return Response.json({ report, message: "VAT summary saved." });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not save VAT summary.");
  }
}
