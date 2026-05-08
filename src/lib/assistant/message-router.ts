import { parseAssistantIntent } from "@/lib/assistant/intent-parser";

export type RoutedAssistantMessage = {
  command?: string;
  intent: ReturnType<typeof parseAssistantIntent>;
  handled: boolean;
  responseKey:
    | "debt_summary"
    | "sales_summary"
    | "low_stock"
    | "help"
    | "handoff";
};

export function routeAssistantMessage(message: string): RoutedAssistantMessage {
  const trimmed = message.trim();
  const command = trimmed.startsWith("/") ? trimmed.split(/\s+/)[0]?.slice(1).toLowerCase() : undefined;

  if (command === "debts") {
    return { command, intent: { name: "debt_summary", confidence: 1 }, handled: true, responseKey: "debt_summary" };
  }

  if (command === "sales") {
    return { command, intent: { name: "sales_summary", confidence: 1 }, handled: true, responseKey: "sales_summary" };
  }

  if (command === "stock") {
    return { command, intent: { name: "low_stock", confidence: 1 }, handled: true, responseKey: "low_stock" };
  }

  if (command === "help") {
    return { command, intent: { name: "unknown", confidence: 1 }, handled: true, responseKey: "help" };
  }

  const intent = parseAssistantIntent(trimmed);
  if (intent.name !== "unknown") {
    return { command, intent, handled: true, responseKey: intent.name };
  }

  return { command, intent, handled: false, responseKey: "handoff" };
}
