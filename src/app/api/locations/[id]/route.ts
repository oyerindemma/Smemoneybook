import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import {
  businessLocationArchiveRequestSchema,
  parseJsonBody,
} from "@/lib/api/validation";
import { requireFeatureAccess } from "@/lib/billing/subscriptions";
import { archiveBusinessLocationForUser } from "@/lib/locations/service";
import { requireBusinessAccess } from "@/lib/operations/access";
import { requirePhase2Feature } from "@/lib/phase2/feature-flags";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const gated = requirePhase2Feature("locations", "Locations");

    if (gated) {
      return gated;
    }

    const user = await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(request, businessLocationArchiveRequestSchema);
    const limited = await enforceRateLimit(request, "locations.archive", 40, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireBusinessAccess(user.id, "locations:archive", body.businessId);
    const featureGate = await requireFeatureAccess(user.id, access.businessId, "multi_location");

    if (featureGate) {
      return featureGate;
    }

    await archiveBusinessLocationForUser({
      userId: user.id,
      businessId: body.businessId,
      locationId: id,
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not archive location.");
  }
}
