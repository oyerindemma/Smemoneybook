import type { VoiceBookkeepingDraft } from "@/lib/voice/types";

export function createVoiceBookkeepingDraft(rawText: string): VoiceBookkeepingDraft {
  const text = rawText.trim();
  const amount = extractNairaAmount(text);
  const lowerText = text.toLowerCase();

  if (/\bsold\b|\bsell\b|\bsale\b/.test(lowerText)) {
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

  if (/\bpaid\b|\bbought\b|\bspent\b|\bexpense\b/.test(lowerText)) {
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
    needsReview: true,
  };
}

function extractNairaAmount(text: string) {
  const match = text.replace(/,/g, "").match(/(?:₦|ngn|n)\s?(\d+(?:\.\d+)?)/i);
  return match ? Number(match[1]) : undefined;
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
