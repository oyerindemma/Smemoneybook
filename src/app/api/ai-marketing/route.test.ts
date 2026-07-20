import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const enforceRateLimit = vi.fn();
const requireBusinessAccess = vi.fn();
const requireLocationAccess = vi.fn();
const requireMinimumPlan = vi.fn();
const listDrafts = vi.fn();
const createDraft = vi.fn();
const approveDraft = vi.fn();
const recordFeedback = vi.fn();
const createAudit = vi.fn();
const originalEnv = { ...process.env };

vi.mock("@/lib/auth/session", () => ({
  requireUser,
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  enforceRateLimit,
}));

vi.mock("@/lib/operations/access", () => ({
  requireBusinessAccess,
  requireLocationAccess,
}));

vi.mock("@/lib/billing/subscriptions", () => ({
  requireMinimumPlan,
}));

vi.mock("@/lib/phase3/ai-marketing-service", () => ({
  listMarketingDrafts: listDrafts,
  createMarketingDraftForBusiness: createDraft,
  approveMarketingDraft: approveDraft,
  recordMarketingDraftFeedback: recordFeedback,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    auditLog: {
      create: createAudit,
    },
  }),
}));

describe("/api/ai-marketing", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PHASE3_AI_MARKETING_ENABLED = "true";
    requireUser.mockResolvedValue({ id: "user_1" });
    enforceRateLimit.mockResolvedValue(null);
    requireBusinessAccess.mockResolvedValue({ businessId: "biz_1", businessName: "Ada Stores" });
    requireLocationAccess.mockResolvedValue({ businessId: "biz_1", locationId: "loc_1" });
    requireMinimumPlan.mockResolvedValue(null);
    listDrafts.mockResolvedValue([]);
    createDraft.mockResolvedValue({ id: "draft_1", status: "DRAFT" });
    approveDraft.mockResolvedValue({ id: "draft_1", status: "APPROVED" });
    recordFeedback.mockResolvedValue({ id: "feedback_1" });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("requires the Phase 3 AI marketing flag", async () => {
    process.env.NEXT_PUBLIC_PHASE3_AI_MARKETING_ENABLED = "false";
    vi.resetModules();

    const { GET } = await import("@/app/api/ai-marketing/route");
    const response = await GET(new Request("http://localhost/api/ai-marketing?businessId=biz_1"));

    expect(response.status).toBe(404);
    expect(listDrafts).not.toHaveBeenCalled();
  });

  it("creates draft-only marketing content for an authorized business", async () => {
    const { POST } = await import("@/app/api/ai-marketing/route");
    const response = await POST(
      new Request("http://localhost/api/ai-marketing", {
        method: "POST",
        body: JSON.stringify({
          action: "create_draft",
          businessId: "biz_1",
          locationId: "loc_1",
          channel: "whatsapp",
          goal: "announce new stock",
          audience: "regular customers",
          tone: "friendly",
          offer: "Visit today",
          productId: "item_1",
          useProductData: true,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(requireLocationAccess).toHaveBeenCalledWith({
      userId: "user_1",
      businessId: "biz_1",
      locationId: "loc_1",
      permission: "money:write",
    });
    expect(createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        businessName: "Ada Stores",
        businessId: "biz_1",
        actorId: "user_1",
        useProductData: true,
      }),
    );
    expect(createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "ai_marketing.create_draft",
          metadata: expect.objectContaining({ draftOnly: true }),
        }),
      }),
    );
  });

  it("passes review confirmation to draft approval", async () => {
    const { POST } = await import("@/app/api/ai-marketing/route");
    const response = await POST(
      new Request("http://localhost/api/ai-marketing", {
        method: "POST",
        body: JSON.stringify({
          action: "approve_draft",
          businessId: "biz_1",
          draftId: "draft_1",
          reviewConfirmed: true,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(approveDraft).toHaveBeenCalledWith({
      businessId: "biz_1",
      actorId: "user_1",
      draftId: "draft_1",
      reviewConfirmed: true,
    });
  });

  it("records draft feedback", async () => {
    const { POST } = await import("@/app/api/ai-marketing/route");
    const response = await POST(
      new Request("http://localhost/api/ai-marketing", {
        method: "POST",
        body: JSON.stringify({
          action: "feedback",
          businessId: "biz_1",
          draftId: "draft_1",
          rating: "helpful",
          helpful: true,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(recordFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        draftId: "draft_1",
        rating: "helpful",
      }),
    );
  });
});
