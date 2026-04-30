import { suggestCategory } from "@/lib/assist/categorization";

export function extractReceipt(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  const amountMatch = compact.match(/(?:total|amount|paid|ngn|₦|n)\s*[:\-]?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
  const fallbackAmount = compact.match(/([0-9][0-9,]*(?:\.\d{1,2})?)/);
  const amountText = amountMatch?.[1] ?? fallbackAmount?.[1];
  const amount = amountText ? Number(amountText.replace(/,/g, "")) : undefined;
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 2 && !/receipt|invoice/i.test(line));
  const vendor = firstLine?.slice(0, 80);
  const suggestion = suggestCategory({
    description: compact || vendor || "Receipt upload",
    amount,
    type: "expense",
  });

  return {
    vendor,
    amount,
    category: suggestion.category,
    confidence: suggestion.confidence,
  };
}
