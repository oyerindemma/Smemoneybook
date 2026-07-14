import { escapeHtml, isEmailConfigured, sendResendEmail } from "@/lib/email/resend";

type SendPasswordResetEmailInput = {
  to: string;
  resetUrl: string;
};

export const isPasswordResetEmailConfigured = isEmailConfigured;

export async function sendPasswordResetEmail({ to, resetUrl }: SendPasswordResetEmailInput) {
  const safeResetUrl = escapeHtml(resetUrl);

  await sendResendEmail(
    {
      to,
      subject: "Reset your SME MoneyBook password",
      text: [
        "We received a request to reset your SME MoneyBook password.",
        "",
        "Use this secure link within 1 hour:",
        resetUrl,
        "",
        "If you did not request this, you can ignore this email.",
      ].join("\n"),
      html: [
        "<p>We received a request to reset your SME MoneyBook password.</p>",
        `<p><a href="${safeResetUrl}">Reset your password</a></p>`,
        "<p>This secure link expires in 1 hour.</p>",
        "<p>If you did not request this, you can ignore this email.</p>",
      ].join(""),
    },
    "password reset email",
  );
}
