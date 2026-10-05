export const aiMarketingDraftModelVersion = "marketing-draft-template-v1";

export type MarketingChannel =
  | "whatsapp"
  | "instagram"
  | "facebook"
  | "product_description"
  | "reactivation"
  | "announcement"
  | string;

export type MarketingProductContext = {
  id?: string;
  name: string;
  sellingPrice?: number | null;
  quantityOnHand?: number | null;
  permissionGranted: boolean;
};

export type MarketingDraftInput = {
  businessName: string;
  businessType?: string | null;
  channel: MarketingChannel;
  goal: string;
  audience: string;
  tone: string;
  offer?: string | null;
  product?: MarketingProductContext | null;
};

export type MarketingSafetyWarning = {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
};

export type MarketingDraftResult = {
  modelVersion: string;
  status: "DRAFT";
  content: string;
  safetyWarnings: MarketingSafetyWarning[];
  sourceInputs: {
    businessName: string;
    businessType?: string | null;
    channel: MarketingChannel;
    goal: string;
    audience: string;
    tone: string;
    offer?: string | null;
    productId?: string;
    productName?: string;
    productDataUsed: boolean;
  };
  requiresReview: true;
};

export function generateMarketingDraft(input: MarketingDraftInput): MarketingDraftResult {
  const productDataUsed = Boolean(input.product?.permissionGranted);
  const productName = productDataUsed ? input.product?.name : undefined;
  const warnings = buildSafetyWarnings(input, productDataUsed);
  const channel = input.channel.toLowerCase();
  const productPhrase = productName ? ` our ${productName}` : " what we have for you";
  const offerPhrase = input.offer?.trim() ? ` ${input.offer.trim()}` : "";
  const pricePhrase =
    productDataUsed && typeof input.product?.sellingPrice === "number"
      ? ` Price: ${formatCurrency(input.product.sellingPrice)}.`
      : "";
  const stockPhrase =
    productDataUsed && typeof input.product?.quantityOnHand === "number"
      ? ` Available stock: ${Math.max(0, input.product.quantityOnHand)}.`
      : "";
  const content = buildContent({
    channel,
    businessName: input.businessName,
    audience: input.audience,
    tone: input.tone,
    goal: input.goal,
    productPhrase,
    offerPhrase,
    pricePhrase,
    stockPhrase,
  });

  return {
    modelVersion: aiMarketingDraftModelVersion,
    status: "DRAFT",
    content,
    safetyWarnings: warnings,
    sourceInputs: {
      businessName: input.businessName,
      businessType: input.businessType,
      channel: input.channel,
      goal: input.goal,
      audience: input.audience,
      tone: input.tone,
      offer: input.offer,
      productId: productDataUsed ? input.product?.id : undefined,
      productName,
      productDataUsed,
    },
    requiresReview: true,
  };
}

export function assertMarketingDraftCanBeApproved({
  reviewConfirmed,
  safetyWarnings,
}: {
  reviewConfirmed: boolean;
  safetyWarnings: MarketingSafetyWarning[];
}) {
  if (!reviewConfirmed) {
    throw new Error("Marketing drafts require user review before approval.");
  }

  if (safetyWarnings.some((warning) => warning.severity === "critical")) {
    throw new Error("Resolve critical marketing safety warnings before approval.");
  }
}

function buildContent({
  channel,
  businessName,
  audience,
  tone,
  goal,
  productPhrase,
  offerPhrase,
  pricePhrase,
  stockPhrase,
}: {
  channel: string;
  businessName: string;
  audience: string;
  tone: string;
  goal: string;
  productPhrase: string;
  offerPhrase: string;
  pricePhrase: string;
  stockPhrase: string;
}) {
  if (channel === "instagram") {
    return `${businessName}: ${tone} update for ${audience}. Discover${productPhrase}.${offerPhrase}${pricePhrase}${stockPhrase} Send us a message to order.`;
  }

  if (channel === "facebook") {
    return `${businessName} has a ${tone} update for ${audience}. If your goal is ${goal}, take a look at${productPhrase}.${offerPhrase}${pricePhrase}${stockPhrase} Contact us for details.`;
  }

  if (channel === "product_description") {
    return `${productPhrase.replace(/^ our /, "")} from ${businessName}. Built for ${audience}, with a ${tone} style.${offerPhrase}${pricePhrase}${stockPhrase}`;
  }

  if (channel === "reactivation") {
    return `Hello, ${businessName} has something new for you. We thought you might like${productPhrase}.${offerPhrase}${pricePhrase}${stockPhrase} Reply when you are ready.`;
  }

  return `Hi, ${businessName} has a ${tone} update for ${audience}. Check out${productPhrase}.${offerPhrase}${pricePhrase}${stockPhrase} Please review before sending.`;
}

function buildSafetyWarnings(input: MarketingDraftInput, productDataUsed: boolean): MarketingSafetyWarning[] {
  const warnings: MarketingSafetyWarning[] = [
    {
      code: "review_required",
      severity: "info",
      message: "Draft only. A user must review before sending or publishing.",
    },
  ];
  const combined = `${input.goal} ${input.offer ?? ""}`.toLowerCase();

  if (input.product && !productDataUsed) {
    warnings.push({
      code: "product_permission_missing",
      severity: "warning",
      message: "Product data was not used because permission was not granted.",
    });
  }

  if (!input.offer?.trim()) {
    warnings.push({
      code: "no_offer",
      severity: "info",
      message: "No offer or price claim was added.",
    });
  }

  if (/\b(guaranteed|miracle|cure|risk-free|free money)\b/.test(combined)) {
    warnings.push({
      code: "potentially_misleading_claim",
      severity: "critical",
      message: "Review potentially misleading or prohibited claim before use.",
    });
  }

  return warnings;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}
