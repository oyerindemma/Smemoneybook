import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockAiMarketingAccessError extends Error {
    status: number;
    code: string;

    constructor(message: string, status: number, code: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  return {
    AccessError: MockAiMarketingAccessError,
    requireUser: vi.fn(),
    enforceRateLimit: vi.fn(),
    requireAccess: vi.fn(),
    listSegments: vi.fn(),
    listCampaigns: vi.fn(),
    createCampaign: vi.fn(),
    getCampaignDetail: vi.fn(),
    listRecipients: vi.fn(),
    generateDraft: vi.fn(),
    approveCampaign: vi.fn(),
    attemptSend: vi.fn(),
    getExportCampaign: vi.fn(),
    updateConsent: vi.fn(),
    getSetup: vi.fn(),
    auditCreate: vi.fn(),
  };
});

vi.mock("@/lib/auth/session", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));

vi.mock("@/lib/ai-marketing/authorization", () => ({
  AiMarketingAccessError: mocks.AccessError,
  requireAiMarketingAccess: mocks.requireAccess,
  isAiMarketingFeatureEnabledForServer: () => true,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    auditLog: { create: mocks.auditCreate },
  }),
}));

vi.mock("@/lib/ai-marketing/service", () => ({
  listAiMarketingSegments: mocks.listSegments,
  listAiMarketingCampaigns: mocks.listCampaigns,
  createAiMarketingCampaign: mocks.createCampaign,
  getAiMarketingCampaignDetail: mocks.getCampaignDetail,
  listAiMarketingCampaignRecipients: mocks.listRecipients,
  generateAiMarketingCampaignDraft: mocks.generateDraft,
  approveAiMarketingCampaign: mocks.approveCampaign,
  attemptAiMarketingSend: mocks.attemptSend,
  getAiMarketingCampaignForExport: mocks.getExportCampaign,
  updateCustomerMarketingConsent: mocks.updateConsent,
  getAiMarketingSetup: mocks.getSetup,
}));

const originalEnv = { ...process.env };

const access = {
  businessId: "biz_1",
  businessName: "Preview Shop",
  currency: "NGN",
  userId: "user_1",
  role: "OWNER",
  canRead: true,
  canCreate: true,
  canApprove: true,
  canSend: true,
  canExport: true,
  canManageConsent: true,
};

const capabilities = {
  canRead: true,
  canCreate: true,
  canApprove: true,
  canSend: true,
  canExport: true,
  canManageConsent: true,
};

const setup = {
  provider: { configured: true, provider: "openai", model: "gpt-5-mini", requiresPhase3Ai: true },
  delivery: {
    enabled: false,
    status: "disabled",
    provider: null,
    message: "Outbound AI Marketing sending is disabled for this Preview release.",
  },
};

const segment = {
  key: "verified_marketing_consent",
  label: "Verified marketing consent",
  definition: "Customers with explicit marketing consent and a usable preferred contact channel.",
  period: {
    start: "2026-07-01T00:00:00.000Z",
    end: "2026-08-01T00:00:00.000Z",
    label: "2026-07-01 to 2026-08-01",
  },
  customerCount: 3,
  consentEligibleCount: 1,
  excludedCount: 2,
  dataLimitations: ["Existing customers default to unknown consent until valid consent evidence is recorded."],
};

const campaign = {
  id: "campaign_1",
  name: "Weekend campaign",
  objective: "Invite consented customers to review new stock.",
  channel: "whatsapp",
  status: "draft",
  segmentDefinition: {
    label: "Verified marketing consent",
    definition: "Customers with explicit marketing consent.",
    dataLimitations: [],
  },
  recipientSummary: { total: 3, eligible: 1, excluded: 2, disabled: 0 },
  latestDraft: null,
  drafts: [],
  recipients: [
    {
      id: "recipient_1",
      customerId: "customer_1",
      customerName: "Ada",
      maskedContact: "+234******001",
      consentStatus: "consented",
      eligibilityStatus: "eligible",
      deliveryStatus: "not_sent",
      preferredChannel: "whatsapp",
      doNotContact: false,
    },
    {
      id: "recipient_2",
      customerId: "customer_2",
      customerName: "Bala",
      maskedContact: "+234******002",
      consentStatus: "unknown",
      eligibilityStatus: "excluded",
      exclusionReason: "consent_unknown",
      deliveryStatus: "not_sent",
      preferredChannel: "whatsapp",
      doNotContact: false,
    },
  ],
  createdAt: "2026-07-30T08:00:00.000Z",
};

describe("Phase 3H AI Marketing API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PHASE3_AI_MARKETING_ENABLED = "true";
    process.env.PHASE3_AI_MARKETING_ENABLED = "true";
    process.env.PHASE3_AI_MARKETING_SENDING_ENABLED = "false";
    process.env.PHASE3_AI_ENABLED = "true";
    mocks.requireUser.mockResolvedValue({ id: "user_1", email: "owner@example.com" });
    mocks.enforceRateLimit.mockResolvedValue(null);
    mocks.requireAccess.mockResolvedValue(access);
    mocks.listSegments.mockResolvedValue([segment]);
    mocks.listCampaigns.mockResolvedValue([campaign]);
    mocks.createCampaign.mockResolvedValue(campaign);
    mocks.getCampaignDetail.mockResolvedValue(campaign);
    mocks.listRecipients.mockResolvedValue({ campaignId: "campaign_1", summary: campaign.recipientSummary, recipients: campaign.recipients });
    mocks.generateDraft.mockResolvedValue({
      id: "draft_1",
      campaignId: "campaign_1",
      content: "Hello. New stock is available for review this weekend.",
      promptVersion: "phase3h-ai-marketing-draft-v1",
      model: "gpt-5-mini",
      reviewLabel: "AI-generated draft \u2014 review before approval.",
      safetyWarnings: [],
    });
    mocks.approveCampaign.mockResolvedValue({
      ...campaign,
      status: "approved",
      approvedAt: "2026-07-30T08:10:00.000Z",
    });
    mocks.attemptSend.mockResolvedValue({
      enabled: false,
      status: "disabled",
      provider: null,
      message: "Outbound AI Marketing sending is disabled for this Preview release.",
      campaignId: "campaign_1",
      eligibleRecipientCount: 1,
      sentCount: 0,
    });
    mocks.getExportCampaign.mockResolvedValue({
      ...campaign,
      createdAt: new Date("2026-07-30T08:00:00.000Z"),
      recipients: campaign.recipients.map((recipient) => ({
        ...recipient,
        createdAt: new Date("2026-07-30T08:00:00.000Z"),
        customer: {
          id: recipient.customerId,
          name: recipient.customerName,
          preferredChannel: recipient.preferredChannel,
          doNotContact: recipient.doNotContact,
        },
      })),
      drafts: [
        {
          id: "draft_1",
          content: "Hello. New stock is available for review this weekend.",
          promptVersion: "phase3h-ai-marketing-draft-v1",
          model: "gpt-5-mini",
          createdByUserId: "user_1",
          createdAt: new Date("2026-07-30T08:05:00.000Z"),
          approvedContentAt: new Date("2026-07-30T08:10:00.000Z"),
        },
      ],
    });
    mocks.updateConsent.mockResolvedValue({
      id: "customer_2",
      name: "Bala",
      marketingConsentStatus: "opted_out",
      marketingConsentSource: "owner_preview_review",
      marketingOptOutAt: "2026-07-30T08:15:00.000Z",
      preferredChannel: "whatsapp",
      doNotContact: true,
      consentNotes: "Preview opt-out management QA.",
    });
    mocks.getSetup.mockReturnValue(setup);
    mocks.auditCreate.mockResolvedValue({});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("lists deterministic segments and audits segment views", async () => {
    const { GET } = await import("@/app/api/ai-marketing/segments/route");
    const response = await GET(new Request("http://localhost/api/ai-marketing/segments?businessId=biz_1&start=2026-07-01&end=2026-08-01"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.segments).toHaveLength(1);
    expect(payload.capabilities).toMatchObject(capabilities);
    expect(mocks.requireAccess).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: "biz_1", permission: "ai_marketing:read" }),
    );
    expect(mocks.listSegments).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        periodStart: expect.any(Date),
        periodEnd: expect.any(Date),
      }),
    );
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "ai_marketing.segment_viewed" }),
      }),
    );
  });

  it("creates campaigns with owner access and consent-aware recipient summaries", async () => {
    const { POST } = await import("@/app/api/ai-marketing/campaigns/route");
    const response = await POST(jsonRequest("http://localhost/api/ai-marketing/campaigns", {
      businessId: "biz_1",
      name: "Weekend campaign",
      objective: "Invite consented customers to review new stock.",
      channel: "whatsapp",
      segmentKey: "verified_marketing_consent",
      periodStart: "2026-07-01",
      periodEnd: "2026-08-01",
    }));
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.campaign.recipientSummary).toMatchObject({ eligible: 1, excluded: 2 });
    expect(mocks.requireAccess).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: "biz_1", permission: "ai_marketing:create" }),
    );
    expect(mocks.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        createdByUserId: "user_1",
        segmentKey: "verified_marketing_consent",
      }),
    );
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "ai_marketing.campaign_created" }),
      }),
    );
  });

  it("generates drafts only when the AI provider is configured", async () => {
    const { AiMarketingDraftingSetupError } = await import("@/lib/ai-marketing/drafting");
    mocks.generateDraft.mockRejectedValueOnce(new AiMarketingDraftingSetupError());

    const { POST } = await import("@/app/api/ai-marketing/campaigns/[id]/draft/route");
    const setupResponse = await POST(
      jsonRequest("http://localhost/api/ai-marketing/campaigns/campaign_1/draft", {
        businessId: "biz_1",
        tone: "friendly",
      }),
      { params: Promise.resolve({ id: "campaign_1" }) },
    );

    expect(setupResponse.status).toBe(503);
    expect(await setupResponse.text()).toContain("AI Marketing drafting needs");

    mocks.generateDraft.mockResolvedValueOnce({
      id: "draft_1",
      campaignId: "campaign_1",
      content: "Hello. New stock is available for review this weekend.",
      promptVersion: "phase3h-ai-marketing-draft-v1",
      model: "gpt-5-mini",
      reviewLabel: "AI-generated draft \u2014 review before approval.",
      safetyWarnings: [],
    });
    const response = await POST(
      jsonRequest("http://localhost/api/ai-marketing/campaigns/campaign_1/draft", {
        businessId: "biz_1",
        tone: "friendly",
        editableNotes: "Keep it truthful and short.",
      }),
      { params: Promise.resolve({ id: "campaign_1" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.draft.reviewLabel).toContain("review before approval");
    expect(mocks.generateDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        campaignId: "campaign_1",
        businessName: "Preview Shop",
      }),
    );
  });

  it("requires explicit approval before the send-disabled workflow can be attempted", async () => {
    const approveRoute = await import("@/app/api/ai-marketing/campaigns/[id]/approve/route");
    const sendRoute = await import("@/app/api/ai-marketing/campaigns/[id]/send/route");

    const approval = await approveRoute.POST(
      jsonRequest("http://localhost/api/ai-marketing/campaigns/campaign_1/approve", {
        businessId: "biz_1",
        draftId: "draft_1",
        reviewConfirmed: true,
        content: "Owner edited copy.",
      }),
      { params: Promise.resolve({ id: "campaign_1" }) },
    );

    expect(approval.status).toBe(200);
    expect(mocks.approveCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        campaignId: "campaign_1",
        draftId: "draft_1",
        reviewConfirmed: true,
        content: "Owner edited copy.",
      }),
    );

    const send = await sendRoute.POST(
      new Request("http://localhost/api/ai-marketing/campaigns/campaign_1/send?businessId=biz_1", { method: "POST" }),
      { params: Promise.resolve({ id: "campaign_1" }) },
    );
    const payload = await send.json();

    expect(send.status).toBe(200);
    expect(payload.delivery).toMatchObject({ status: "disabled", sentCount: 0 });
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "ai_marketing.sending_attempted" }),
      }),
    );
  });

  it("reads recipients, exports CSV, and records opt-outs", async () => {
    const recipientsRoute = await import("@/app/api/ai-marketing/campaigns/[id]/recipients/route");
    const exportRoute = await import("@/app/api/ai-marketing/export/route");
    const consentRoute = await import("@/app/api/ai-marketing/customers/[id]/consent/route");

    const recipients = await recipientsRoute.GET(
      new Request("http://localhost/api/ai-marketing/campaigns/campaign_1/recipients?businessId=biz_1"),
      { params: Promise.resolve({ id: "campaign_1" }) },
    );
    expect(recipients.status).toBe(200);
    expect((await recipients.json()).recipients[1].exclusionReason).toBe("consent_unknown");

    const exported = await exportRoute.GET(new Request("http://localhost/api/ai-marketing/export?businessId=biz_1&campaignId=campaign_1"));
    expect(exported.status).toBe(200);
    expect(exported.headers.get("Content-Type")).toContain("text/csv");
    expect(await exported.text()).toContain("phase3h-ai-marketing-draft-v1");

    const consent = await consentRoute.PUT(
      jsonRequest("http://localhost/api/ai-marketing/customers/customer_2/consent", {
        businessId: "biz_1",
        marketingConsentStatus: "opted_out",
        marketingConsentSource: "owner_preview_review",
        preferredChannel: "whatsapp",
        doNotContact: true,
      }, "PUT"),
      { params: Promise.resolve({ id: "customer_2" }) },
    );
    const payload = await consent.json();

    expect(consent.status).toBe(200);
    expect(payload.customer).toMatchObject({ marketingConsentStatus: "opted_out", doNotContact: true });
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "ai_marketing.opt_out_recorded" }),
      }),
    );
  });

  it("rejects unauthorized or cross-business access", async () => {
    mocks.requireAccess.mockRejectedValueOnce(
      new mocks.AccessError("You do not have access to this business.", 403, "business_access_denied"),
    );

    const { GET } = await import("@/app/api/ai-marketing/segments/route");
    const response = await GET(new Request("http://localhost/api/ai-marketing/segments?businessId=other_biz"));

    expect(response.status).toBe(403);
    expect(await response.text()).toContain("You do not have access to this business.");
  });

  it("returns rate-limit responses without executing the service", async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce(Response.json({ error: "Too many requests." }, { status: 429 }));

    const { GET } = await import("@/app/api/ai-marketing/campaigns/route");
    const response = await GET(new Request("http://localhost/api/ai-marketing/campaigns?businessId=biz_1"));

    expect(response.status).toBe(429);
    expect(mocks.listCampaigns).not.toHaveBeenCalled();
  });

  it("returns 405 for unsupported write methods", async () => {
    const segmentsRoute = await import("@/app/api/ai-marketing/segments/route");
    const campaignsRoute = await import("@/app/api/ai-marketing/campaigns/route");
    const detailRoute = await import("@/app/api/ai-marketing/campaigns/[id]/route");
    const draftRoute = await import("@/app/api/ai-marketing/campaigns/[id]/draft/route");
    const approveRoute = await import("@/app/api/ai-marketing/campaigns/[id]/approve/route");
    const sendRoute = await import("@/app/api/ai-marketing/campaigns/[id]/send/route");
    const recipientsRoute = await import("@/app/api/ai-marketing/campaigns/[id]/recipients/route");
    const exportRoute = await import("@/app/api/ai-marketing/export/route");
    const consentRoute = await import("@/app/api/ai-marketing/customers/[id]/consent/route");

    expect(segmentsRoute.POST().status).toBe(405);
    expect(campaignsRoute.PATCH().status).toBe(405);
    expect(detailRoute.DELETE().status).toBe(405);
    expect(draftRoute.GET().status).toBe(405);
    expect(approveRoute.DELETE().status).toBe(405);
    expect(sendRoute.PUT().status).toBe(405);
    expect(recipientsRoute.POST().status).toBe(405);
    expect(exportRoute.DELETE().status).toBe(405);
    expect(consentRoute.POST().status).toBe(405);
  });
});

function jsonRequest(url: string, body: unknown, method = "POST") {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
