import { requireUser } from "@/lib/auth/session";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { categorizationRequestSchema, parseJsonBody } from "@/lib/api/validation";
import { suggestCategory } from "@/lib/assist/categorization";
import { requireFeatureAccess } from "@/lib/billing/subscriptions";
import { requireBusinessAccess } from "@/lib/operations/access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await parseJsonBody(request, categorizationRequestSchema);
    const access = await requireBusinessAccess(user.id, undefined, body.businessId);
    const gated = await requireFeatureAccess(user.id, access.businessId, "ai_category_assist");

    if (gated) {
      return gated;
    }

    return Response.json({ suggestion: suggestCategory(body) });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not suggest a category.");
  }
}
