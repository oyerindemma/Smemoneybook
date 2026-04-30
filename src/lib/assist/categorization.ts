const expenseRules = [
  { category: "Rent", words: ["rent", "shop", "lease"] },
  { category: "Transport", words: ["transport", "delivery", "fuel", "bike", "dispatch"] },
  { category: "Utilities", words: ["nepa", "electric", "power", "water", "internet", "data"] },
  { category: "Inventory purchase", words: ["stock", "goods", "supplier", "carton", "wholesale"] },
  { category: "Staff wages", words: ["salary", "wage", "staff", "commission"] },
  { category: "Bank charges", words: ["charge", "pos fee", "bank fee"] },
] as const;

const saleRules = [
  { category: "Product sale", words: ["sold", "sale", "customer", "paid"] },
  { category: "Service income", words: ["service", "repair", "consult", "fee"] },
] as const;

export function suggestCategory({
  description,
  type,
}: {
  description: string;
  amount?: number;
  type?: "sale" | "expense" | "transfer";
}) {
  const text = description.toLowerCase();
  const rules = type === "sale" ? saleRules : type === "expense" ? expenseRules : [...saleRules, ...expenseRules];
  const match = rules.find((rule) => rule.words.some((word) => text.includes(word)));

  if (type === "transfer") {
    return {
      category: "Transfer",
      confidence: 0.98,
      reason: "Transfers are internal account movements.",
    };
  }

  if (match) {
    return {
      category: match.category,
      confidence: 0.82,
      reason: `Matched common Nigerian SME wording for ${match.category.toLowerCase()}.`,
    };
  }

  return {
    category: type === "sale" ? "Product sale" : "General business expense",
    confidence: 0.45,
    reason: "No strong keyword match, so this is a safe default.",
  };
}
