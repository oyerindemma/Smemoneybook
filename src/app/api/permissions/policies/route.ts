import { requireUser } from "@/lib/auth/session";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { parseJsonBody, permissionPolicyRequestSchema } from "@/lib/api/validation";
import { requireFeatureAccess } from "@/lib/billing/subscriptions";
import { requireBusinessAccess } from "@/lib/operations/access";
import {
  listPermissionPoliciesForUser,
  savePermissionPolicyForUser,
} from "@/lib/permissions/registry";
import { requirePhase2Feature } from "@/lib/phase2/feature-flags";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const gated = requirePhase2Feature("granularPermissions", "Granular permissions");

    if (gated) {
      return gated;
    }

    const user = await requireUser();
    const businessId = new URL(request.url).searchParams.get("businessId");

    if (!businessId) {
      return jsonError("Choose a business.", 400);
    }

    const access = await requireBusinessAccess(user.id, "admin", businessId);
    const featureGate = await requireFeatureAccess(user.id, access.businessId, "granular_permissions");

    if (featureGate) {
      return featureGate;
    }

    const policies = await listPermissionPoliciesForUser(user.id, businessId);
    return Response.json(policies);
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not load permission policies.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const gated = requirePhase2Feature("granularPermissions", "Granular permissions");

    if (gated) {
      return gated;
    }

    const user = await requireUser();
    const body = await parseJsonBody(request, permissionPolicyRequestSchema);
    const access = await requireBusinessAccess(user.id, "admin", body.businessId);
    const featureGate = await requireFeatureAccess(user.id, access.businessId, "granular_permissions");

    if (featureGate) {
      return featureGate;
    }

    const policies = await savePermissionPolicyForUser({
      userId: user.id,
      businessId: body.businessId,
      role: body.role,
      permissions: body.permissions,
    });
    return Response.json(policies);
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not save permission policy.");
  }
}
