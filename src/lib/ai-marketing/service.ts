import { DebtStatus, DebtType, Prisma, TransactionType } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  assertNoSensitiveMarketingTargeting,
  getMarketingEligibility,
  maskMarketingContact,
  normalizeMarketingChannel,
  normalizeMarketingConsentStatus,
  type AiMarketingConsentStatus,
} from "@/lib/ai-marketing/consent";
import {
  calculateAiMarketingSegments,
  customerMarketingEligibility,
  getMarketingSegment,
  serializeMarketingSegmentDefinition,
  type AiMarketingSegmentKey,
  type MarketingCustomerProfile,
} from "@/lib/ai-marketing/segments";
import {
  assessMarketingDraftSafety,
  generateAiMarketingDraft,
  getAiMarketingProviderSetupStatus,
  type AiMarketingDraftProvider,
} from "@/lib/ai-marketing/drafting";
import { getAiMarketingDeliveryStatus, isAiMarketingSendingEnabled } from "@/lib/ai-marketing/delivery";
import { AiMarketingDomainError } from "@/lib/ai-marketing/api";

export type AiMarketingCampaignCreateInput = {
  businessId: string;
  createdByUserId: string;
  name: string;
  objective: string;
  channel: string;
  segmentKey: AiMarketingSegmentKey;
  periodStart: Date;
  periodEnd: Date;
  scheduledAt?: Date;
};

type CampaignBaseRecord = {
  id: string;
  name: string;
  objective: string;
  channel: string;
  status: string;
  segmentDefinition: Prisma.JsonValue;
  createdAt: Date;
  approvedAt?: Date | null;
  scheduledAt?: Date | null;
};

type CampaignSummaryRecord = CampaignBaseRecord & {
  recipients: Array<{ eligibilityStatus: string; deliveryStatus?: string | null }>;
  drafts?: MarketingMessageDraftRecord[];
};

type CampaignDetailRecord = CampaignBaseRecord & {
  approvedByUserId?: string | null;
  drafts: MarketingMessageDraftRecord[];
  recipients: MarketingRecipientRecord[];
  deliveries: Array<{ status: string }>;
};

type MarketingRecipientRecord = {
  id: string;
  customerId: string;
  consentStatus: string;
  eligibilityStatus: string;
  exclusionReason?: string | null;
  deliveryStatus: string;
  createdAt: Date;
  customer: {
    name: string;
    phone?: string | null;
    preferredChannel?: string | null;
    doNotContact?: boolean | null;
  };
};

type MarketingMessageDraftRecord = {
  id: string;
  campaignId?: string | null;
  channel: string;
  content: string;
  promptVersion?: string | null;
  model?: string | null;
  createdByUserId: string;
  approvedContentAt?: Date | null;
  createdAt: Date;
};

type CustomerConsentRecord = {
  id: string;
  name: string;
  marketingConsentStatus: string;
  marketingConsentSource?: string | null;
  marketingConsentAt?: Date | null;
  marketingOptOutAt?: Date | null;
  preferredChannel: string;
  doNotContact: boolean;
  consentNotes?: string | null;
};

export async function listAiMarketingSegments({
  businessId,
  periodStart,
  periodEnd,
}: {
  businessId: string;
  periodStart: Date;
  periodEnd: Date;
}) {
  const customers = await loadMarketingCustomerProfiles(businessId);

  return calculateAiMarketingSegments({
    customers,
    periodStart,
    periodEnd,
  }).map((segment) => ({
    ...segment,
    matchingCustomerIds: undefined,
    recipientIds: undefined,
  }));
}

export async function createAiMarketingCampaign(input: AiMarketingCampaignCreateInput) {
  assertNoSensitiveMarketingTargeting(`${input.name} ${input.objective}`);
  const customers = await loadMarketingCustomerProfiles(input.businessId);
  const segments = calculateAiMarketingSegments({
    customers,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  });
  const selectedSegment = getMarketingSegment(segments, input.segmentKey);

  if (!selectedSegment) {
    throw new AiMarketingDomainError("Choose a valid AI Marketing segment.", 400, "segment_invalid");
  }

  const profilesById = new Map(customers.map((customer) => [customer.id, customer]));
  const recipientRows = selectedSegment.matchingCustomerIds
    .map((customerId) => profilesById.get(customerId))
    .filter(Boolean)
    .map((customer) => {
      const eligibility = customerMarketingEligibility(customer as MarketingCustomerProfile);

      return {
        businessId: input.businessId,
        customerId: (customer as MarketingCustomerProfile).id,
        consentStatus: eligibility.consentStatus,
        eligibilityStatus: eligibility.eligibilityStatus,
        exclusionReason: eligibility.exclusionReason,
        deliveryStatus: "not_sent",
      };
    });

  const campaign = await getPrisma().marketingCampaign.create({
    data: {
      businessId: input.businessId,
      name: input.name.trim(),
      objective: input.objective.trim(),
      channel: normalizeMarketingChannel(input.channel),
      segmentDefinition: toJson(serializeMarketingSegmentDefinition(selectedSegment)),
      status: "draft",
      createdByUserId: input.createdByUserId,
      scheduledAt: input.scheduledAt,
      recipients: {
        create: recipientRows,
      },
    },
  });

  return getAiMarketingCampaignDetail({
    businessId: input.businessId,
    campaignId: campaign.id,
  });
}

export async function listAiMarketingCampaigns({
  businessId,
  limit = 25,
}: {
  businessId: string;
  limit?: number;
}) {
  const campaigns = await getPrisma().marketingCampaign.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      recipients: {
        select: {
          eligibilityStatus: true,
          deliveryStatus: true,
        },
      },
      drafts: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return campaigns.map(serializeCampaignSummary);
}

export async function getAiMarketingCampaignDetail({
  businessId,
  campaignId,
}: {
  businessId: string;
  campaignId: string;
}) {
  const campaign = await getPrisma().marketingCampaign.findFirst({
    where: { id: campaignId, businessId },
    include: {
      recipients: {
        orderBy: [{ eligibilityStatus: "asc" }, { createdAt: "asc" }],
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              marketingConsentStatus: true,
              preferredChannel: true,
              doNotContact: true,
            },
          },
        },
      },
      drafts: {
        orderBy: { createdAt: "desc" },
      },
      deliveries: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!campaign) {
    throw new AiMarketingDomainError("AI Marketing campaign was not found.", 404, "campaign_not_found");
  }

  return serializeCampaignDetail(campaign);
}

export async function listAiMarketingCampaignRecipients({
  businessId,
  campaignId,
}: {
  businessId: string;
  campaignId: string;
}) {
  const campaign = await getAiMarketingCampaignDetail({ businessId, campaignId });

  return {
    campaignId: campaign.id,
    summary: campaign.recipientSummary,
    recipients: campaign.recipients,
  };
}

export async function generateAiMarketingCampaignDraft({
  businessId,
  campaignId,
  createdByUserId,
  businessName,
  tone,
  editableNotes,
  provider,
}: {
  businessId: string;
  campaignId: string;
  createdByUserId: string;
  businessName: string;
  tone?: string;
  editableNotes?: string;
  provider?: AiMarketingDraftProvider;
}) {
  const campaign = await getPrisma().marketingCampaign.findFirst({
    where: { id: campaignId, businessId },
    include: {
      recipients: { select: { eligibilityStatus: true } },
    },
  });

  if (!campaign) {
    throw new AiMarketingDomainError("AI Marketing campaign was not found.", 404, "campaign_not_found");
  }

  assertNoSensitiveMarketingTargeting(`${campaign.objective} ${editableNotes ?? ""}`);
  const segmentDefinition = readSegmentDefinition(campaign.segmentDefinition);
  const draft = await generateAiMarketingDraft({
    provider,
    input: {
      businessName,
      objective: campaign.objective,
      channel: campaign.channel,
      segmentLabel: segmentDefinition.label,
      segmentDefinition: segmentDefinition.definition,
      customerCount: campaign.recipients.length,
      consentEligibleCount: campaign.recipients.filter((recipient) => recipient.eligibilityStatus === "eligible").length,
      excludedCount: campaign.recipients.filter((recipient) => recipient.eligibilityStatus === "excluded").length,
      dataLimitations: segmentDefinition.dataLimitations,
      tone,
      editableNotes,
    },
  });

  const saved = await getPrisma().marketingMessageDraft.create({
    data: {
      businessId,
      campaignId,
      channel: campaign.channel,
      content: draft.content,
      promptVersion: draft.promptVersion,
      model: draft.model,
      createdByUserId,
    },
  });

  return {
    ...serializeMessageDraft(saved),
    safetyWarnings: draft.safetyWarnings,
    reviewLabel: draft.reviewLabel,
    provider: draft.provider,
  };
}

export async function approveAiMarketingCampaign({
  businessId,
  campaignId,
  draftId,
  approvedByUserId,
  reviewConfirmed,
  content,
}: {
  businessId: string;
  campaignId: string;
  draftId: string;
  approvedByUserId: string;
  reviewConfirmed: boolean;
  content?: string;
}) {
  if (!reviewConfirmed) {
    throw new AiMarketingDomainError("Campaign approval requires explicit owner review.", 400, "review_required");
  }

  const draft = await getPrisma().marketingMessageDraft.findFirst({
    where: {
      id: draftId,
      campaignId,
      businessId,
    },
  });

  if (!draft) {
    throw new AiMarketingDomainError("Choose a valid AI Marketing draft.", 404, "draft_not_found");
  }

  const approvedContent = (content?.trim() || draft.content).slice(0, 2_000);
  const warnings = assessMarketingDraftSafety(approvedContent);

  if (warnings.some((warning) => warning.severity === "critical")) {
    throw new AiMarketingDomainError("Resolve critical AI Marketing draft warnings before approval.", 400, "draft_unsafe");
  }

  await getPrisma().$transaction([
    getPrisma().marketingMessageDraft.update({
      where: { id: draft.id },
      data: {
        content: approvedContent,
        approvedContentAt: new Date(),
      },
    }),
    getPrisma().marketingCampaign.update({
      where: { id: campaignId },
      data: {
        status: "approved",
        approvedByUserId,
        approvedAt: new Date(),
      },
    }),
  ]);

  return getAiMarketingCampaignDetail({ businessId, campaignId });
}

export async function attemptAiMarketingSend({
  businessId,
  campaignId,
}: {
  businessId: string;
  campaignId: string;
}) {
  const campaign = await getPrisma().marketingCampaign.findFirst({
    where: { id: campaignId, businessId },
    include: {
      recipients: {
        select: {
          id: true,
          eligibilityStatus: true,
        },
      },
    },
  });

  if (!campaign) {
    throw new AiMarketingDomainError("AI Marketing campaign was not found.", 404, "campaign_not_found");
  }

  if (!campaign.approvedAt) {
    throw new AiMarketingDomainError("Approve this campaign before any send attempt.", 409, "approval_required");
  }

  const eligibleRecipientIds = campaign.recipients
    .filter((recipient) => recipient.eligibilityStatus === "eligible")
    .map((recipient) => recipient.id);

  if (!isAiMarketingSendingEnabled()) {
    await getPrisma().$transaction([
      getPrisma().marketingCampaign.update({
        where: { id: campaign.id },
        data: { status: "send_disabled" },
      }),
      getPrisma().marketingCampaignRecipient.updateMany({
        where: {
          businessId,
          campaignId,
          id: { in: eligibleRecipientIds },
        },
        data: {
          deliveryStatus: "disabled",
        },
      }),
    ]);

    return {
      ...getAiMarketingDeliveryStatus(),
      campaignId,
      eligibleRecipientCount: eligibleRecipientIds.length,
      sentCount: 0,
    };
  }

  return {
    enabled: true,
    status: "setup_required" as const,
    provider: null,
    message: "Outbound AI Marketing delivery provider is not configured for this Preview.",
    campaignId,
    eligibleRecipientCount: eligibleRecipientIds.length,
    sentCount: 0,
  };
}

export async function updateCustomerMarketingConsent({
  businessId,
  customerId,
  consentStatus,
  consentSource,
  preferredChannel,
  doNotContact,
  consentNotes,
}: {
  businessId: string;
  customerId: string;
  consentStatus: AiMarketingConsentStatus;
  consentSource?: string;
  preferredChannel?: string;
  doNotContact?: boolean;
  consentNotes?: string;
}) {
  const existing = await getPrisma().customer.findFirst({
    where: { id: customerId, businessId },
  });

  if (!existing) {
    throw new AiMarketingDomainError("Customer was not found.", 404, "customer_not_found");
  }

  const normalizedConsent = normalizeMarketingConsentStatus(consentStatus);
  const normalizedChannel = normalizeMarketingChannel(preferredChannel ?? existing.preferredChannel);
  const optedOut = normalizedConsent === "opted_out" || Boolean(doNotContact);
  const consentAt = normalizedConsent === "consented"
    ? existing.marketingConsentAt ?? new Date()
    : normalizedConsent === "unknown"
      ? null
      : existing.marketingConsentAt;
  const optOutAt = optedOut ? existing.marketingOptOutAt ?? new Date() : null;

  const updated = await getPrisma().customer.update({
    where: { id: existing.id },
    data: {
      marketingConsentStatus: normalizedConsent,
      marketingConsentSource: consentSource?.trim() || existing.marketingConsentSource,
      marketingConsentAt: consentAt,
      marketingOptOutAt: optOutAt,
      preferredChannel: normalizedChannel,
      doNotContact: Boolean(doNotContact),
      consentNotes: consentNotes?.trim() || null,
    },
  });
  const eligibility = getMarketingEligibility({
    consentStatus: updated.marketingConsentStatus,
    optOutAt: updated.marketingOptOutAt,
    doNotContact: updated.doNotContact,
    preferredChannel: updated.preferredChannel,
    phone: updated.phone,
  });

  await getPrisma().marketingCampaignRecipient.updateMany({
    where: { businessId, customerId: updated.id },
    data: {
      consentStatus: eligibility.consentStatus,
      eligibilityStatus: eligibility.eligibilityStatus,
      exclusionReason: eligibility.exclusionReason ?? null,
    },
  });

  if (optedOut) {
    await getPrisma().marketingOptOut.create({
      data: {
        businessId,
        customerId: updated.id,
        channel: normalizedChannel,
        source: consentSource?.trim() || "manual",
      },
    });
  }

  return serializeCustomerConsent(updated);
}

export async function getAiMarketingCampaignForExport({
  businessId,
  campaignId,
}: {
  businessId: string;
  campaignId: string;
}) {
  const campaign = await getPrisma().marketingCampaign.findFirst({
    where: { id: campaignId, businessId },
    include: {
      recipients: {
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              preferredChannel: true,
              doNotContact: true,
            },
          },
        },
      },
      drafts: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!campaign) {
    throw new AiMarketingDomainError("AI Marketing campaign was not found.", 404, "campaign_not_found");
  }

  return campaign;
}

export function getAiMarketingSetup() {
  return {
    provider: getAiMarketingProviderSetupStatus(),
    delivery: getAiMarketingDeliveryStatus(),
  };
}

async function loadMarketingCustomerProfiles(businessId: string): Promise<MarketingCustomerProfile[]> {
  const customers = await getPrisma().customer.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    include: {
      transactions: {
        where: { type: TransactionType.SALE },
        select: {
          id: true,
          type: true,
          amount: true,
          occurredAt: true,
          paymentStatus: true,
          inventoryItem: {
            select: {
              name: true,
              category: { select: { name: true } },
            },
          },
          invoiceItems: true,
        },
      },
      debts: {
        where: {
          type: DebtType.CUSTOMER_OWES_BUSINESS,
          status: DebtStatus.OPEN,
        },
        select: {
          id: true,
          type: true,
          amount: true,
          paidAmount: true,
          status: true,
          dueAt: true,
          createdAt: true,
        },
      },
      issuedDocuments: {
        select: {
          id: true,
          status: true,
          total: true,
          balanceDue: true,
          dueDate: true,
          createdAt: true,
        },
      },
    },
  });

  return customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    createdAt: customer.createdAt,
    marketingConsentStatus: customer.marketingConsentStatus,
    marketingOptOutAt: customer.marketingOptOutAt,
    preferredChannel: customer.preferredChannel,
    doNotContact: customer.doNotContact,
    transactions: customer.transactions.map((transaction) => {
      const invoiceItems = parseInvoiceItems(transaction.invoiceItems);

      return {
        id: transaction.id,
        type: transaction.type.toLowerCase(),
        amount: readNumber(transaction.amount),
        occurredAt: transaction.occurredAt,
        paymentStatus: transaction.paymentStatus.toLowerCase(),
        productName: transaction.inventoryItem?.name ?? invoiceItems[0]?.name,
        productCategory: transaction.inventoryItem?.category?.name ?? invoiceItems[0]?.categoryName,
      };
    }),
    debts: customer.debts.map((debt) => ({
      id: debt.id,
      type: debt.type.toLowerCase(),
      status: debt.status.toLowerCase(),
      amount: readNumber(debt.amount),
      paidAmount: readNumber(debt.paidAmount),
      dueAt: debt.dueAt,
      createdAt: debt.createdAt,
    })),
    issuedDocuments: customer.issuedDocuments.map((document) => ({
      id: document.id,
      status: document.status.toLowerCase(),
      total: readNumber(document.total),
      balanceDue: readNumber(document.balanceDue),
      dueDate: document.dueDate,
      createdAt: document.createdAt,
    })),
  }));
}

function serializeCampaignSummary(campaign: CampaignSummaryRecord) {
  return {
    id: campaign.id,
    name: campaign.name,
    objective: campaign.objective,
    channel: campaign.channel,
    status: campaign.status,
    segmentDefinition: campaign.segmentDefinition,
    recipientSummary: summarizeRecipients(campaign.recipients),
    latestDraft: campaign.drafts?.[0] ? serializeMessageDraft(campaign.drafts[0]) : null,
    createdAt: campaign.createdAt.toISOString(),
    approvedAt: campaign.approvedAt?.toISOString(),
    scheduledAt: campaign.scheduledAt?.toISOString(),
  };
}

function serializeCampaignDetail(campaign: CampaignDetailRecord) {
  return {
    ...serializeCampaignSummary(campaign),
    approvedByUserId: campaign.approvedByUserId ?? undefined,
    drafts: campaign.drafts.map(serializeMessageDraft),
    recipients: campaign.recipients.slice(0, 50).map(serializeRecipient),
    deliverySummary: summarizeDeliveries(campaign.recipients, campaign.deliveries),
  };
}

function serializeRecipient(recipient: MarketingRecipientRecord) {
  return {
    id: recipient.id,
    customerId: recipient.customerId,
    customerName: recipient.customer.name,
    maskedContact: maskMarketingContact(recipient.customer.phone),
    consentStatus: recipient.consentStatus,
    eligibilityStatus: recipient.eligibilityStatus,
    exclusionReason: recipient.exclusionReason ?? undefined,
    deliveryStatus: recipient.deliveryStatus,
    preferredChannel: recipient.customer.preferredChannel,
    doNotContact: recipient.customer.doNotContact,
    createdAt: recipient.createdAt.toISOString(),
  };
}

function serializeMessageDraft(draft: MarketingMessageDraftRecord) {
  return {
    id: draft.id,
    campaignId: draft.campaignId,
    channel: draft.channel,
    content: draft.content,
    promptVersion: draft.promptVersion ?? undefined,
    model: draft.model ?? undefined,
    createdByUserId: draft.createdByUserId,
    approvedContentAt: draft.approvedContentAt?.toISOString(),
    createdAt: draft.createdAt.toISOString(),
  };
}

function serializeCustomerConsent(customer: CustomerConsentRecord) {
  return {
    id: customer.id,
    name: customer.name,
    marketingConsentStatus: customer.marketingConsentStatus,
    marketingConsentSource: customer.marketingConsentSource,
    marketingConsentAt: customer.marketingConsentAt?.toISOString(),
    marketingOptOutAt: customer.marketingOptOutAt?.toISOString(),
    preferredChannel: customer.preferredChannel,
    doNotContact: customer.doNotContact,
    consentNotes: customer.consentNotes,
  };
}

function summarizeRecipients(recipients: Array<{ eligibilityStatus: string; deliveryStatus?: string | null }>) {
  return {
    total: recipients.length,
    eligible: recipients.filter((recipient) => recipient.eligibilityStatus === "eligible").length,
    excluded: recipients.filter((recipient) => recipient.eligibilityStatus === "excluded").length,
    disabled: recipients.filter((recipient) => recipient.deliveryStatus === "disabled").length,
  };
}

function summarizeDeliveries(
  recipients: Array<{ deliveryStatus: string }>,
  deliveries: Array<{ status: string }>,
) {
  return {
    notSent: recipients.filter((recipient) => recipient.deliveryStatus === "not_sent").length,
    disabled: recipients.filter((recipient) => recipient.deliveryStatus === "disabled").length,
    sent: deliveries.filter((delivery) => delivery.status === "sent").length,
    delivered: deliveries.filter((delivery) => delivery.status === "delivered").length,
    failed: deliveries.filter((delivery) => delivery.status === "failed").length,
  };
}

function readSegmentDefinition(value: Prisma.JsonValue) {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

  return {
    label: typeof record.label === "string" ? record.label : "Selected segment",
    definition: typeof record.definition === "string" ? record.definition : "Selected AI Marketing segment.",
    dataLimitations: Array.isArray(record.dataLimitations)
      ? record.dataLimitations.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function parseInvoiceItems(value: Prisma.JsonValue) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => item && typeof item === "object" ? item as Record<string, unknown> : null)
    .filter(Boolean)
    .map((item) => ({
      name: typeof item?.name === "string" ? item.name : undefined,
      categoryName: typeof item?.categoryName === "string" ? item.categoryName : undefined,
    }));
}

function readNumber(value: unknown) {
  if (value instanceof Prisma.Decimal) {
    return value.toNumber();
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
