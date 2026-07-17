import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { parseJsonBody, staffInvitationActionRequestSchema } from "@/lib/api/validation";
import { requireFeatureAccess } from "@/lib/billing/subscriptions";
import { requireBusinessAccess } from "@/lib/operations/access";
import { logApiFailure } from "@/lib/operations/monitoring";
import { revokeStaffInvitationForUser } from "@/lib/operations/service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let userId: string | undefined;

  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    userId = user.id;
    const { id } = await params;
    const body = await parseJsonBody(request, staffInvitationActionRequestSchema);
    const limited = await enforceRateLimit(request, "staff.invitations.revoke", 20, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireBusinessAccess(user.id, "admin", body.businessId);
    const gated = await requireFeatureAccess(user.id, access.businessId, "team_management");

    if (gated) {
      return gated;
    }

    const invitation = await revokeStaffInvitationForUser({
      userId: user.id,
      businessId: access.businessId,
      invitationId: id,
    });

    return Response.json({ invitation, message: "Invitation revoked." });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    await logApiFailure({ request, error, actorId: userId });
    return jsonErrorFromUnknown(error, "Could not revoke invitation.");
  }
}
