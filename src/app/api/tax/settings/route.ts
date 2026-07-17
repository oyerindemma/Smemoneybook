import { requireUser } from "@/lib/auth/session";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { parseJsonBody, taxSettingsRequestSchema } from "@/lib/api/validation";
import { requireFeatureAccess } from "@/lib/billing/subscriptions";
import { requireBusinessAccess } from "@/lib/operations/access";
import { requirePhase2Feature } from "@/lib/phase2/feature-flags";
import { getTaxSettingsForUser, saveTaxSettingsForUser } from "@/lib/tax/settings";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const gated = requirePhase2Feature("tax", "Tax settings");

    if (gated) {
      return gated;
    }

    const user = await requireUser();
    const businessId = new URL(request.url).searchParams.get("businessId");

    if (!businessId) {
      return jsonError("Choose a business.", 400);
    }

    const access = await requireBusinessAccess(user.id, "reports:write", businessId);
    const featureGate = await requireFeatureAccess(user.id, access.businessId, "tax_management");

    if (featureGate) {
      return featureGate;
    }

    const settings = await getTaxSettingsForUser(user.id, businessId);
    return Response.json(settings);
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not load tax settings.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const gated = requirePhase2Feature("tax", "Tax settings");

    if (gated) {
      return gated;
    }

    const user = await requireUser();
    const body = await parseJsonBody(request, taxSettingsRequestSchema);
    const access = await requireBusinessAccess(user.id, "admin", body.businessId);
    const featureGate = await requireFeatureAccess(user.id, access.businessId, "tax_management");

    if (featureGate) {
      return featureGate;
    }

    const settings = await saveTaxSettingsForUser(user.id, body);
    return Response.json(settings);
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not save tax settings.");
  }
}
