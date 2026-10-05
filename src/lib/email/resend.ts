type ResendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

function getTrimmedEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function getRequiredEmailEnv(name: "RESEND_API_KEY") {
  const value = getTrimmedEnv(name);
  if (!value || !value.startsWith("re_") || isPlaceholder(value)) {
    throw new Error(`Email is not configured. Add ${name} to the server environment.`);
  }

  return value;
}

function getEmailFrom() {
  const from = getTrimmedEnv("EMAIL_FROM");
  if (!from) {
    throw new Error("Email sender is not configured. Add EMAIL_FROM to the server environment.");
  }

  const address = extractEmailAddress(from);
  if (!address) {
    throw new Error("EMAIL_FROM must contain a valid sender email address.");
  }

  if (isProductionDeploy() && !address.toLowerCase().endsWith("@smemoneybook.com")) {
    throw new Error("Production EMAIL_FROM must use the verified smemoneybook.com domain.");
  }

  return from;
}

export function isEmailConfigured() {
  try {
    getRequiredEmailEnv("RESEND_API_KEY");
    getEmailFrom();
    return true;
  } catch {
    return false;
  }
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
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Could not send ${context}. Email provider returned ${response.status}.`);
  }
}

function extractEmailAddress(value: string) {
  const bracketed = value.match(/<([^<>]+)>$/)?.[1];
  const address = (bracketed ?? value).trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? address : null;
}

function isPlaceholder(value: string) {
  return value === "[SENSITIVE]" || /\[redacted\]|placeholder|xxx/i.test(value);
}

function isProductionDeploy() {
  return process.env.VERCEL_ENV === "production" ||
    (process.env.NODE_ENV === "production" && !process.env.VERCEL_ENV);
}
