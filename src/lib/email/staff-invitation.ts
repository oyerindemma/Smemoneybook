import { escapeHtml, isEmailConfigured, sendResendEmail } from "@/lib/email/resend";

type SendStaffInvitationEmailInput = {
  to: string;
  inviteUrl: string;
  businessName: string;
  inviterName: string;
  role: "staff" | "accountant";
  expiresAt: string | Date;
};

export const isStaffInvitationEmailConfigured = isEmailConfigured;

export async function sendStaffInvitationEmail({
  to,
  inviteUrl,
  businessName,
  inviterName,
  role,
  expiresAt,
}: SendStaffInvitationEmailInput) {
  const roleLabel = role === "accountant" ? "accountant" : "staff";
  const safeBusinessName = escapeHtml(businessName);
  const safeInviterName = escapeHtml(inviterName);
  const safeInviteUrl = escapeHtml(inviteUrl);
  const expiry = new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(expiresAt));

  await sendResendEmail(
    {
      to,
      subject: `Join ${businessName} on SME MoneyBook`,
      text: [
        `${inviterName} invited you to join ${businessName} as ${roleLabel}.`,
        "",
        "Open this secure invitation link:",
        inviteUrl,
        "",
        `This invitation expires on ${expiry}.`,
        "Sign in or create an account with this email address before accepting.",
      ].join("\n"),
      html: [
        `<p>${safeInviterName} invited you to join <strong>${safeBusinessName}</strong> as ${roleLabel}.</p>`,
        `<p><a href="${safeInviteUrl}">Accept staff invitation</a></p>`,
        `<p>This invitation expires on ${escapeHtml(expiry)}.</p>`,
        "<p>Sign in or create an account with this email address before accepting.</p>",
      ].join(""),
    },
    "staff invitation email",
  );
}
