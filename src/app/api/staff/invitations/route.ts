import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { parseJsonBody, staffInvitationRequestSchema } from "@/lib/api/validation";
import { requireFeatureAccess } from "@/lib/billing/subscriptions";
import { requireBusinessAccess } from "@/lib/operations/access";
import { inviteStaff } from "@/lib/operations/service";
import { logApiFailure } from "@/lib/operations/monitoring";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let userId: string | undefined;

  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    userId = user.id;
    const body = await parseJsonBody(request, staffInvitationRequestSchema);
    const limited = await enforceRateLimit(request, "staff.invitations.write", 20, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireBusinessAccess(user.id, "admin", body.businessId);
    const gated = await requireFeatureAccess(user.id, access.businessId, "team_management");

    if (gated) {
      return gated;
    }

    const invitation = await inviteStaff({
      actorId: user.id,
      businessId: access.businessId,
      email: body.email,
      role: body.role,
    });

    return Response.json({ invitation }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    await logApiFailure({ request, error, actorId: userId });
    return jsonErrorFromUnknown(error, "Could not invite this staff member.");
  }
}
