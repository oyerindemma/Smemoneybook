import type { RoutedAssistantMessage } from "@/lib/assistant/message-router";

export function buildFutureAssistantPrompt({
  message,
  route,
}: {
  message: string;
  route: RoutedAssistantMessage;
}) {
  return [
    "You are SME MoneyBook's WhatsApp assistant for Nigerian small businesses.",
    "Answer with short, practical bookkeeping guidance using only verified business context.",
    `User message: ${message}`,
    `Detected intent: ${route.intent.name}`,
    "If data is missing, ask one clear follow-up question.",
  ].join("\n");
}
