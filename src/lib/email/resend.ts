type ResendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type ResendErrorResponse = {
  message?: string;
  name?: string;
};

const emailFromEnvNames = ["EMAIL_FROM", "ADMIN_EMAIL", "Admin_Email"] as const;

function getTrimmedEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function getRequiredEmailEnv(name: "RESEND_API_KEY") {
  const value = getTrimmedEnv(name);
  if (!value) {
    throw new Error(`Email is not configured. Add ${name} to the server environment.`);
  }

  return value;
}

function getEmailFrom() {
  const from = emailFromEnvNames.map((name) => getTrimmedEnv(name)).find(Boolean);
  if (!from) {
    throw new Error("Email sender is not configured. Add EMAIL_FROM to the server environment.");
  }

  return from;
}

export function isEmailConfigured() {
  return Boolean(getTrimmedEnv("RESEND_API_KEY") && emailFromEnvNames.some((name) => getTrimmedEnv(name)));
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function sendResendEmail(input: ResendEmailInput, context = "email") {
  const apiKey = getRequiredEmailEnv("RESEND_API_KEY");
  const from = getEmailFrom();

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ResendErrorResponse | null;
    const message = payload?.message || payload?.name || `Resend returned ${response.status}`;
    throw new Error(`Could not send ${context}. ${message}`);
  }
}
