import { requireUser } from "@/lib/auth/session";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { requireFeatureAccess } from "@/lib/billing/subscriptions";
import { requireBusinessAccess } from "@/lib/operations/access";
import { getOperationsOverview } from "@/lib/operations/service";
import { logApiFailure } from "@/lib/operations/monitoring";

export const runtime = "nodejs";

export async function GET(request: Request) {
  let userId: string | undefined;

  try {
    const user = await requireUser();
    userId = user.id;
    const businessId = new URL(request.url).searchParams.get("businessId") ?? undefined;
    const access = await requireBusinessAccess(user.id, "admin", businessId);
    const gated = await requireFeatureAccess(user.id, access.businessId, "audit_tools");

    if (gated) {
      return gated;
    }

    const operations = await getOperationsOverview(user.id, access.businessId);
    return Response.json({ operations });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    await logApiFailure({ request, error, actorId: userId });
    return jsonErrorFromUnknown(error, "Could not load operations.");
  }
}
