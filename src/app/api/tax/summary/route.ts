import { requireUser } from "@/lib/auth/session";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { saveTaxRunForUser } from "@/lib/bookkeeping/persistence";
import { requireFeatureAccess } from "@/lib/billing/subscriptions";
import { requireBusinessAccess } from "@/lib/operations/access";
import { getMonthYear } from "@/app/api/reports/monthly/route";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const { businessId, month, year } = getMonthYear(request);
    const access = await requireBusinessAccess(user.id, "reports:write", businessId);
    const gated = await requireFeatureAccess(user.id, access.businessId, "advanced_reports");

    if (gated) {
      return gated;
    }

    const report = await saveTaxRunForUser({ userId: user.id, businessId: access.businessId, month, year });

    return Response.json({ report, message: "VAT summary saved." });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not save VAT summary.");
  }
}
