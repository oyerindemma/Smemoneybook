import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const enforceRateLimit = vi.fn();
const requireBusinessAccess = vi.fn();
const requireMinimumPlan = vi.fn();
const getOverview = vi.fn();
const recordEvent = vi.fn();
const createDataset = vi.fn();
const recordRun = vi.fn();
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
}));

vi.mock("@/lib/billing/subscriptions", () => ({
  requireMinimumPlan,
}));

vi.mock("@/lib/phase3/ai-evaluation-service", () => ({
  getAiEvaluationOverview: getOverview,
  recordAiEvaluationEvent: recordEvent,
  createAiEvaluationDataset: createDataset,
  recordAiEvaluationRun: recordRun,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    auditLog: {
      create: createAudit,
    },
  }),
}));

describe("/api/ai-evaluation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PHASE3_AI_EVALUATION_ENABLED = "true";
    requireUser.mockResolvedValue({ id: "user_1" });
    enforceRateLimit.mockResolvedValue(null);
    requireBusinessAccess.mockResolvedValue({ businessId: "biz_1" });
    requireMinimumPlan.mockResolvedValue(null);
    getOverview.mockResolvedValue({ summary: { eventCount: 0 }, recentEvents: [], datasets: [], runs: [] });
    recordEvent.mockResolvedValue({ id: "event_1" });
    createDataset.mockResolvedValue({ id: "dataset_1" });
    recordRun.mockResolvedValue({ id: "run_1" });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("requires the Phase 3 AI evaluation flag", async () => {
    process.env.NEXT_PUBLIC_PHASE3_AI_EVALUATION_ENABLED = "false";
    vi.resetModules();

    const { GET } = await import("@/app/api/ai-evaluation/route");
    const response = await GET(new Request("http://localhost/api/ai-evaluation?businessId=biz_1"));

    expect(response.status).toBe(404);
    expect(getOverview).not.toHaveBeenCalled();
  });

  it("loads evaluation overview for authorized Pro report users", async () => {
    const { GET } = await import("@/app/api/ai-evaluation/route");
    const response = await GET(new Request("http://localhost/api/ai-evaluation?businessId=biz_1&days=14"));

    expect(response.status).toBe(200);
    expect(requireBusinessAccess).toHaveBeenCalledWith("user_1", "reports:write", "biz_1");
    expect(requireMinimumPlan).toHaveBeenCalledWith("user_1", "biz_1", "pro", "Upgrade to Pro to use AI Evaluation.");
    expect(getOverview).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        since: expect.any(Date),
      }),
    );
  });

  it("records evaluation events without prompt content", async () => {
    const { POST } = await import("@/app/api/ai-evaluation/route");
    const response = await POST(
      new Request("http://localhost/api/ai-evaluation", {
        method: "POST",
        body: JSON.stringify({
          action: "event",
          businessId: "biz_1",
          feature: "phase3b_ai_advisor",
          artifactType: "assistant_message",
          artifactId: "msg_1",
          eventType: "feedback",
          rating: "helpful",
          correct: true,
          prompt: "should not be accepted by schema",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        actorId: "user_1",
        artifactId: "msg_1",
        rating: "helpful",
        correct: true,
      }),
    );
    expect(recordEvent.mock.calls[0][0]).not.toHaveProperty("prompt");
    expect(createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "ai_evaluation.event",
        }),
      }),
    );
  });

  it("records evaluation dataset metadata", async () => {
    const { POST } = await import("@/app/api/ai-evaluation/route");
    const response = await POST(
      new Request("http://localhost/api/ai-evaluation", {
        method: "POST",
        body: JSON.stringify({
          action: "dataset",
          businessId: "biz_1",
          name: "Grounding regression",
          purpose: "grounding",
          source: "redacted_internal_cases",
          retentionPolicy: "90 days",
          piiRedacted: true,
          consentRequired: true,
          sampleCount: 12,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(createDataset).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        piiRedacted: true,
        consentRequired: true,
      }),
    );
  });
});
