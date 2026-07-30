export type AiMarketingExportCampaign = {
  id: string;
  name: string;
  objective: string;
  channel: string;
  status: string;
  createdAt: Date | string;
  approvedAt?: Date | string | null;
  segmentDefinition: unknown;
  recipients: Array<{
    id: string;
    consentStatus: string;
    eligibilityStatus: string;
    exclusionReason?: string | null;
    deliveryStatus: string;
    customer: {
      id: string;
      name: string;
      preferredChannel?: string | null;
      doNotContact?: boolean | null;
    };
  }>;
  drafts: Array<{
    id: string;
    channel: string;
    content: string;
    promptVersion?: string | null;
    model?: string | null;
    approvedContentAt?: Date | string | null;
  }>;
};

export function buildAiMarketingCampaignCsv({
  campaign,
  generatedBy,
}: {
  campaign: AiMarketingExportCampaign;
  generatedBy: string;
}) {
  const rows = [
    ["section", "field", "value", "notes"],
    ["campaign", "name", campaign.name, ""],
    ["campaign", "objective", campaign.objective, ""],
    ["campaign", "channel", campaign.channel, ""],
    ["campaign", "status", campaign.status, ""],
    ["campaign", "generated_by", generatedBy, "internal user"],
    ["campaign", "created_at", toIso(campaign.createdAt), ""],
    ["campaign", "approved_at", campaign.approvedAt ? toIso(campaign.approvedAt) : "", ""],
    ["campaign", "segment_definition", safeJson(campaign.segmentDefinition), "aggregate segment context"],
    ["draft", "count", String(campaign.drafts.length), "AI-generated drafts require owner review"],
    ...campaign.drafts.map((draft) => [
      "draft",
      draft.id,
      redactMarketingExportText(draft.content),
      `${draft.promptVersion ?? ""} ${draft.model ?? ""}`.trim(),
    ]),
    ["recipients", "count", String(campaign.recipients.length), ""],
    ...campaign.recipients.map((recipient) => [
      "recipient",
      recipient.customer.id,
      recipient.customer.name,
      [
        `consent=${recipient.consentStatus}`,
        `eligibility=${recipient.eligibilityStatus}`,
        recipient.exclusionReason ? `exclusion=${recipient.exclusionReason}` : "",
        `delivery=${recipient.deliveryStatus}`,
        `preferred_channel=${recipient.customer.preferredChannel ?? ""}`,
        recipient.customer.doNotContact ? "do_not_contact=true" : "",
      ].filter(Boolean).join("; "),
    ]),
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export function aiMarketingCampaignExportFilename(campaign: { id: string; createdAt: Date | string }) {
  return `ai-marketing-${toIso(campaign.createdAt).slice(0, 10)}-${campaign.id.slice(-8)}.csv`;
}

export function redactMarketingExportText(value: string) {
  return value
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(/postgres(ql)?:\/\/\S+/gi, "[redacted]")
    .replace(/OPENAI_API_KEY\s*=\s*\S+/gi, "OPENAI_API_KEY=[redacted]")
    .replace(/DATABASE_URL\s*=\s*\S+/gi, "DATABASE_URL=[redacted]");
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function safeJson(value: unknown) {
  return redactMarketingExportText(JSON.stringify(value ?? {}));
}
