export type AssistantIntent =
  | { name: "debt_summary"; confidence: number }
  | { name: "sales_summary"; confidence: number }
  | { name: "low_stock"; confidence: number }
  | { name: "unknown"; confidence: number };

export function parseAssistantIntent(message: string): AssistantIntent {
  const normalized = message.toLowerCase().trim();

  if (/owed|owe|debt|owing|receivable/.test(normalized)) {
    return { name: "debt_summary", confidence: 0.85 };
  }

  if (/today'?s sales|sales today|today sales|revenue/.test(normalized)) {
    return { name: "sales_summary", confidence: 0.82 };
  }

  if (/low stock|stock alerts?|items left|out of stock/.test(normalized)) {
    return { name: "low_stock", confidence: 0.84 };
  }

  return { name: "unknown", confidence: 0.2 };
}
