import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  aiMarketingDraftModelVersion,
  assertMarketingDraftCanBeApproved,
  generateMarketingDraft,
  type MarketingSafetyWarning,
} from "@/lib/phase3/ai-marketing";

export async function listMarketingDrafts({
  businessId,
  locationId,
}: {
  businessId: string;
  locationId?: string;
}) {
  const drafts = await getPrisma().marketingDraft.findMany({
    where: {
      businessId,
      ...(locationId ? { locationId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return drafts.map((draft) => ({
    id: draft.id,
    channel: draft.channel,
    goal: draft.goal,
    audience: draft.audience,
    tone: draft.tone,
    productName: draft.productName,
    offer: draft.offer,
    status: draft.status,
    content: draft.content,
    safetyWarnings: draft.safetyWarnings,
    modelVersion: draft.modelVersion,
    createdAt: draft.createdAt.toISOString(),
  }));
}

export async function createMarketingDraftForBusiness({
  businessId,
  locationId,
  businessName,
  businessType,
  channel,
  goal,
  audience,
  tone,
  offer,
  productId,
  useProductData,
  actorId,
}: {
  businessId: string;
  locationId?: string;
  businessName: string;
  businessType?: string | null;
  channel: string;
  goal: string;
  audience: string;
  tone: string;
  offer?: string;
  productId?: string;
  useProductData?: boolean;
  actorId?: string;
}) {
  const product = productId
    ? await getPrisma().inventoryItem.findFirst({
        where: {
          id: productId,
          businessId,
        },
        select: {
          id: true,
          name: true,
          sellingPrice: true,
          quantityOnHand: true,
        },
      })
    : null;
  const draft = generateMarketingDraft({
    businessName,
    businessType,
    channel,
    goal,
    audience,
    tone,
    offer,
    product: product
      ? {
          id: product.id,
          name: product.name,
          sellingPrice: product.sellingPrice.toNumber(),
          quantityOnHand: product.quantityOnHand,
          permissionGranted: Boolean(useProductData),
        }
      : null,
  });

  return getPrisma().marketingDraft.create({
    data: {
      businessId,
      locationId,
      channel,
      goal,
      audience,
      tone,
      offer,
      productId: draft.sourceInputs.productId,
      productName: draft.sourceInputs.productName,
      content: draft.content,
      status: draft.status,
      safetyWarnings: toJson(draft.safetyWarnings),
      sourceInputs: toJson(draft.sourceInputs),
      modelVersion: aiMarketingDraftModelVersion,
      createdById: actorId,
    },
  });
}

export async function approveMarketingDraft({
  businessId,
  draftId,
  actorId,
  reviewConfirmed,
}: {
  businessId: string;
  draftId: string;
  actorId?: string;
  reviewConfirmed: boolean;
}) {
  const draft = await getPrisma().marketingDraft.findFirst({
    where: {
      id: draftId,
      businessId,
    },
  });

  if (!draft) {
    throw new Error("Choose a valid marketing draft.");
  }

  assertMarketingDraftCanBeApproved({
    reviewConfirmed,
    safetyWarnings: draft.safetyWarnings as MarketingSafetyWarning[],
  });

  return getPrisma().marketingDraft.update({
    where: { id: draft.id },
    data: {
      status: "APPROVED",
      reviewedById: actorId,
      reviewedAt: new Date(),
      approvedAt: new Date(),
    },
  });
}

export async function recordMarketingDraftFeedback({
  businessId,
  draftId,
  actorId,
  rating,
  helpful,
  correction,
}: {
  businessId: string;
  draftId: string;
  actorId?: string;
  rating: string;
  helpful?: boolean;
  correction?: string;
}) {
  const draft = await getPrisma().marketingDraft.findFirst({
    where: {
      id: draftId,
      businessId,
    },
    select: { id: true },
  });

  if (!draft) {
    throw new Error("Choose a valid marketing draft.");
  }

  return getPrisma().marketingDraftFeedback.create({
    data: {
      businessId,
      draftId,
      actorId,
      rating,
      helpful,
      correction,
    },
  });
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
