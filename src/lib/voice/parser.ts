import type { VoiceBookkeepingDraft } from "@/lib/voice/types";

export function createVoiceBookkeepingDraft(rawText: string): VoiceBookkeepingDraft {
  const text = rawText.trim();
  const amount = extractNairaAmount(text);
  const lowerText = text.toLowerCase();

  if (/\bsold\b|\bsell\b|\bsale\b|\breceived\b|\bcollected\b|\bgot\b/.test(lowerText)) {
    return {
      intent: {
        kind: "sale",
        rawText: text,
        amount,
        paymentMethod: extractPaymentMethod(lowerText),
      },
      capture: {
        type: "sale",
        amount,
        description: text,
        paymentStatus: "paid",
      },
      needsReview: true,
    };
  }

  if (/\bpaid\b|\bbought\b|\bbuy\b|\bspent\b|\bexpense\b|\bpurchased\b/.test(lowerText)) {
    return {
      intent: {
        kind: "expense",
        rawText: text,
        amount,
        note: text,
        paymentMethod: extractPaymentMethod(lowerText),
      },
      capture: {
        type: "expense",
        amount,
        description: text,
        paymentStatus: "paid",
      },
      needsReview: true,
    };
  }

  return {
    intent: { kind: "unknown", rawText: text },
    capture: amount
      ? {
          amount,
          description: text,
          paymentStatus: "paid",
        }
      : undefined,
    needsReview: true,
  };
}

function extractNairaAmount(text: string) {
  const normalized = text.replace(/,/g, "");
  const match = normalized.match(/(?:₦|ngn|n|naira)\s?(\d+(?:\.\d+)?)/i);
  const fallbackMatch = normalized.match(/\b(\d+(?:\.\d+)?)\b/);
  return match ? Number(match[1]) : fallbackMatch ? Number(fallbackMatch[1]) : undefined;
}

function extractPaymentMethod(text: string) {
  if (text.includes("pos")) {
    return "pos";
  }

  if (text.includes("bank") || text.includes("transfer")) {
    return "bank";
  }

  if (text.includes("mobile")) {
    return "mobile_money";
  }

  if (text.includes("cash")) {
    return "cash";
  }

  return undefined;
}
