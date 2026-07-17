import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { parseJsonBody, staffInvitationActionRequestSchema } from "@/lib/api/validation";
import { requireFeatureAccess } from "@/lib/billing/subscriptions";
import { isStaffInvitationEmailConfigured, sendStaffInvitationEmail } from "@/lib/email/staff-invitation";
import { requireBusinessAccess } from "@/lib/operations/access";
import { logApiFailure } from "@/lib/operations/monitoring";
import { resendStaffInvitationForUser } from "@/lib/operations/service";

export const runtime = "nodejs";

function getInviteUrl(request: Request, token: string) {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const origin = configuredOrigin || new URL(request.url).origin;
  return `${origin}/invite/${encodeURIComponent(token)}`;
}

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
    const limited = await enforceRateLimit(request, "staff.invitations.resend", 20, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireBusinessAccess(user.id, "admin", body.businessId);
    const gated = await requireFeatureAccess(user.id, access.businessId, "team_management");

    if (gated) {
      return gated;
    }

    const { invitation, businessName } = await resendStaffInvitationForUser({
      userId: user.id,
      businessId: access.businessId,
      invitationId: id,
    });

    if (!invitation.token) {
      throw new Error("Could not create a staff invitation link.");
    }

    const inviteUrl = getInviteUrl(request, invitation.token);

    if (isStaffInvitationEmailConfigured()) {
      try {
        await sendStaffInvitationEmail({
          to: invitation.email,
          inviteUrl,
          businessName,
          inviterName: user.name,
          role: invitation.role === "accountant" ? "accountant" : "staff",
          expiresAt: invitation.expiresAt,
        });
      } catch (error) {
        console.error("staff.invitation_resend_email_failed", error);
        await logApiFailure({ request, error, actorId: user.id, businessId: access.businessId });

        return Response.json({
          invitation,
          inviteUrl,
          emailSent: false,
          message: "Invitation renewed, but the email could not be sent. Copy the invite link and share it manually.",
        });
      }
    }

    return Response.json({
      invitation,
      inviteUrl,
      emailSent: isStaffInvitationEmailConfigured(),
      message: isStaffInvitationEmailConfigured()
        ? "Invitation resent."
        : "Invitation renewed. Copy the invite link and share it manually.",
    });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    await logApiFailure({ request, error, actorId: userId });
    return jsonErrorFromUnknown(error, "Could not resend invitation.");
  }
}
