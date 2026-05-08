export type WhatsAppBotIntent =
  | "today"
  | "debt_summary"
  | "low_stock"
  | "summary"
  | "help"
  | "unknown";

export function detectWhatsAppIntent(message: string): WhatsAppBotIntent {
  const text = message.trim().toLowerCase();

  if (["help", "/help"].includes(text)) {
    return "help";
  }

  if (["today", "sales today", "balance"].includes(text)) {
    return "today";
  }

  if (/who owes|owing|debt|owe me/.test(text)) {
    return "debt_summary";
  }

  if (/low stock|stock/.test(text)) {
    return "low_stock";
  }

  if (/summary|report|month/.test(text)) {
    return "summary";
  }

  return "unknown";
}
