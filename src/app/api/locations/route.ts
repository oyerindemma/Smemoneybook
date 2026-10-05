import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { businessLocationRequestSchema, parseJsonBody } from "@/lib/api/validation";
import { requireFeatureAccess } from "@/lib/billing/subscriptions";
import { requireBusinessAccess } from "@/lib/operations/access";
import {
  createBusinessLocationForUser,
  listBusinessLocationsForUser,
} from "@/lib/locations/service";
import { requirePhase2Feature } from "@/lib/phase2/feature-flags";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const gated = requirePhase2Feature("locations", "Locations");

    if (gated) {
      return gated;
    }

    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get("businessId") ?? undefined;
    const limited = await enforceRateLimit(request, "locations.read", 120, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const result = await listBusinessLocationsForUser(user.id, businessId);
    const featureGate = await requireFeatureAccess(user.id, result.businessId, "multi_location");

    if (featureGate) {
      return featureGate;
    }

    return Response.json(result);
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not load locations.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const gated = requirePhase2Feature("locations", "Locations");

    if (gated) {
      return gated;
    }

    const user = await requireUser();
    const body = await parseJsonBody(request, businessLocationRequestSchema);
    const limited = await enforceRateLimit(request, "locations.write", 40, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireBusinessAccess(user.id, "locations:create", body.businessId);
    const featureGate = await requireFeatureAccess(user.id, access.businessId, "multi_location");

    if (featureGate) {
      return featureGate;
    }

    const location = await createBusinessLocationForUser(user.id, body);
    return Response.json({ location }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not create location.");
  }
}
