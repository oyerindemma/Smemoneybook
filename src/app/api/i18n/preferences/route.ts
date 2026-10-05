import { requireUser } from "@/lib/auth/session";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { i18nPreferenceRequestSchema, parseJsonBody } from "@/lib/api/validation";
import { getLanguagePreference, saveLanguagePreference } from "@/lib/i18n/preferences";
import { requirePhase2Feature } from "@/lib/phase2/feature-flags";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const gated = requirePhase2Feature("i18n", "Language preferences");

    if (gated) {
      return gated;
    }

    const user = await requireUser();
    const businessId = new URL(request.url).searchParams.get("businessId") ?? undefined;
    const preferences = await getLanguagePreference(user.id, businessId);
    return Response.json(preferences);
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not load language preferences.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const gated = requirePhase2Feature("i18n", "Language preferences");

    if (gated) {
      return gated;
    }

    const user = await requireUser();
    const body = await parseJsonBody(request, i18nPreferenceRequestSchema);
    const preferences = await saveLanguagePreference({
      userId: user.id,
      businessId: body.businessId,
      language: body.language,
      applyToBusiness: body.applyToBusiness,
    });
    return Response.json(preferences);
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not save language preferences.");
  }
}
