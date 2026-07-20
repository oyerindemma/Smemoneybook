import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const enforceRateLimit = vi.fn();
const getBusinessAccess = vi.fn();
const requireMinimumPlan = vi.fn();
const createAssistantReply = vi.fn();
const findThread = vi.fn();
const createThread = vi.fn();
const createMessage = vi.fn();
const countMessages = vi.fn();
const createAudit = vi.fn();
const originalEnv = { ...process.env };

vi.mock("@/lib/auth/session", () => ({
  requireUser,
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  enforceRateLimit,
}));

vi.mock("@/lib/operations/access", () => ({
  getBusinessAccess,
}));

vi.mock("@/lib/billing/subscriptions", () => ({
  requireMinimumPlan,
}));

vi.mock("@/lib/assistant/assistant-client", () => ({
  createAssistantReply,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    assistantThread: {
      findFirst: findThread,
      create: createThread,
    },
    assistantMessage: {
      create: createMessage,
      count: countMessages,
    },
    auditLog: {
      create: createAudit,
    },
  }),
}));

describe("/api/assistant/chat Phase 3B", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PHASE3_AI_ADVISOR_ENABLED = "true";
    requireUser.mockResolvedValue({ id: "user_1" });
    enforceRateLimit.mockResolvedValue(null);
    getBusinessAccess.mockResolvedValue({ businessId: "biz_1", businessName: "Demo" });
    requireMinimumPlan.mockResolvedValue(null);
    countMessages.mockResolvedValue(0);
    findThread.mockResolvedValue(null);
    createThread.mockResolvedValue({ id: "thread_1" });
    createMessage
      .mockResolvedValueOnce({ id: "user_msg_1" })
      .mockResolvedValueOnce({ id: "assistant_msg_1" });
    createAssistantReply.mockResolvedValue({
      provider: "local",
      reply: "Recorded today: ₦10,000 in.\n\nGrounding: Today summary.",
      toolResults: [
        {
          ok: true,
          tool: "get_today_summary",
          citations: [
            {
              id: "today_summary",
              metricVersion: "phase3b-advisor-v1",
              kind: "recorded",
              periodStart: "2026-07-19T00:00:00.000Z",
              periodEnd: "2026-07-20T00:00:00.000Z",
              generatedAt: "2026-07-19T06:00:00.000Z",
              sourceTables: ["Transaction"],
              confidence: "high",
              dataWarnings: [],
            },
          ],
        },
      ],
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("requires the Phase 3 advisor flag", async () => {
    process.env.NEXT_PUBLIC_PHASE3_AI_ADVISOR_ENABLED = "false";
    vi.resetModules();

    const { POST } = await import("@/app/api/assistant/chat/route");
    const response = await POST(
      new Request("http://localhost/api/assistant/chat", {
        method: "POST",
        body: JSON.stringify({ businessId: "biz_1", message: "How much did I make today?" }),
      }),
    );

    expect(response.status).toBe(404);
    expect(createAssistantReply).not.toHaveBeenCalled();
  });

  it("stores grounded assistant replies with source citations", async () => {
    const { POST } = await import("@/app/api/assistant/chat/route");
    const response = await POST(
      new Request("http://localhost/api/assistant/chat", {
        method: "POST",
        body: JSON.stringify({ businessId: "biz_1", message: "How much did I make today?" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.assistantMessageId).toBe("assistant_msg_1");
    expect(requireMinimumPlan).toHaveBeenCalledWith(
      "user_1",
      "biz_1",
      "growth",
      "Upgrade to Growth to use the AI Business Advisor.",
    );
    expect(createMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            feature: "phase3b_ai_advisor",
            sourceCitations: expect.arrayContaining([
              expect.objectContaining({ id: "today_summary" }),
            ]),
          }),
        }),
      }),
    );
    expect(createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "assistant.chat" }),
      }),
    );
  });
});
