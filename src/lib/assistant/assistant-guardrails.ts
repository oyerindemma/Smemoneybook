const secretPatterns = [
  /OPENAI_API_KEY/i,
  /WHATSAPP_ACCESS_TOKEN/i,
  /DATABASE_URL/i,
  /PAYSTACK_SECRET_KEY/i,
  /CRON_SECRET/i,
  /password/i,
  /session/i,
  /token/i,
];

const mutationWords = [
  "record payment",
  "delete",
  "adjust stock",
  "create invoice",
  "send whatsapp",
  "send message",
  "change subscription",
  "reverse transaction",
];

export function sanitizeAssistantText(text: string) {
  return text
    .replace(/sk-[A-Za-z0-9_-]+/g, "[secret]")
    .replace(/EA[A-Za-z0-9_-]{12,}/g, "[secret]")
    .slice(0, 4000);
}

export function isSecretRequest(text: string) {
  return secretPatterns.some((pattern) => pattern.test(text));
}

export function requiresConfirmation(text: string) {
  const normalized = text.toLowerCase();
  return mutationWords.some((word) => normalized.includes(word));
}

export function guardUserMessage(text: string) {
  if (isSecretRequest(text)) {
    return {
      allowed: false,
      message: "I can’t help reveal secrets, passwords, tokens, API keys, or internal system details.",
    };
  }

  return { allowed: true };
}

export function guardToolName(toolName: string) {
  if (["send_whatsapp_message", "create_invoice", "record_payment", "adjust_stock"].includes(toolName)) {
    return {
      allowed: false,
      pendingActionRequired: true,
      message: "This action needs your confirmation before SME MoneyBook changes anything.",
    };
  }

  return { allowed: true };
}

export function taxDisclaimer() {
  return "VAT and tax figures are estimates only. Please confirm with a qualified tax professional before filing.";
}
