import { requireUser } from "@/lib/auth/session";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { documentBrandingRequestSchema, parseJsonBody } from "@/lib/api/validation";
import { requireFeatureAccess } from "@/lib/billing/subscriptions";
import {
  getDocumentBrandingForUser,
  saveDocumentBrandingForUser,
} from "@/lib/documents/branding";
import { requireBusinessAccess } from "@/lib/operations/access";
import { requirePhase2Feature } from "@/lib/phase2/feature-flags";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const gated = requirePhase2Feature("invoiceBranding", "Document branding");

    if (gated) {
      return gated;
    }

    const user = await requireUser();
    const businessId = new URL(request.url).searchParams.get("businessId");

    if (!businessId) {
      return jsonError("Choose a business.", 400);
    }

    const access = await requireBusinessAccess(user.id, "admin", businessId);
    const featureGate = await requireFeatureAccess(user.id, access.businessId, "invoice_branding");

    if (featureGate) {
      return featureGate;
    }

    const branding = await getDocumentBrandingForUser(user.id, businessId);
    return Response.json({ branding });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not load document branding.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const gated = requirePhase2Feature("invoiceBranding", "Document branding");

    if (gated) {
      return gated;
    }

    const user = await requireUser();
    const body = await parseJsonBody(request, documentBrandingRequestSchema);
    const access = await requireBusinessAccess(user.id, "admin", body.businessId);
    const featureGate = await requireFeatureAccess(user.id, access.businessId, "invoice_branding");

    if (featureGate) {
      return featureGate;
    }

    const branding = await saveDocumentBrandingForUser(user.id, body);
    return Response.json({ branding });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not save document branding.");
  }
}
