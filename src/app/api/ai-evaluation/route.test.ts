import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockAiEvaluationAccessError extends Error {
    status: number;
    code: string;

    constructor(message: string, status: number, code: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  return {
    AccessError: MockAiEvaluationAccessError,
    requireUser: vi.fn(),
    enforceRateLimit: vi.fn(),
    requireAccess: vi.fn(),
    listSuites: vi.fn(),
    createSuite: vi.fn(),
    getProviderSetup: vi.fn(),
    getSuiteDetail: vi.fn(),
    runSuite: vi.fn(),
    listRuns: vi.fn(),
    getRunDetail: vi.fn(),
    cancelRun: vi.fn(),
    acceptBaseline: vi.fn(),
    compareRuns: vi.fn(),
    auditCreate: vi.fn(),
  };
});

vi.mock("@/lib/auth/session", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));

vi.mock("@/lib/ai-evaluation/authorization", () => ({
  AiEvaluationAccessError: mocks.AccessError,
  requireAiEvaluationAccess: mocks.requireAccess,
  isAiEvaluationFeatureEnabledForServer: () => true,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    auditLog: { create: mocks.auditCreate },
  }),
}));

vi.mock("@/lib/ai-evaluation/runner", () => ({
  listAiEvaluationSuites: mocks.listSuites,
  createDefaultAiEvaluationSuite: mocks.createSuite,
  getAiEvaluationProviderSetupStatus: mocks.getProviderSetup,
  getAiEvaluationSuiteDetail: mocks.getSuiteDetail,
  runAiEvaluationSuite: mocks.runSuite,
  listAiEvaluationRuns: mocks.listRuns,
  getAiEvaluationRunDetail: mocks.getRunDetail,
  cancelAiEvaluationRun: mocks.cancelRun,
  acceptAiEvaluationBaseline: mocks.acceptBaseline,
  compareAiEvaluationRunRecords: mocks.compareRuns,
}));

const access = {
  businessId: "biz_1",
  businessName: "Preview Shop",
  currency: "NGN",
  userId: "user_1",
  email: "owner@example.com",
  role: "OWNER",
  isInternalAdmin: false,
  canRead: true,
  canRun: true,
  canManageCases: true,
  canExport: true,
  canCompareModels: true,
};

const run = {
  id: "run_1",
  status: "completed",
  model: "deterministic-grounded-preview",
  promptVersion: "phase3f-evaluation-preview-v1",
  toolVersion: "phase3-ai-tools-v1",
  datasetVersion: "phase3f-synthetic-v1",
  startedAt: "2026-07-24T00:00:00.000Z",
  completedAt: "2026-07-24T00:00:01.000Z",
  suite: { id: "suite_1", name: "Phase 3F synthetic AI governance suite", targetFeature: "all_ai_surfaces" },
  summary: {
    version: "phase3f-ai-evaluation-v1",
    status: "completed",
    totalCases: 16,
    passedCases: 16,
    failedCases: 0,
    needsReviewCases: 0,
    criticalFailures: 0,
    passRate: 100,
    aggregateScore: 100,
    totalCostKobo: 120,
    totalTokens: 1200,
    averageLatencyMs: 300,
    p95LatencyMs: 700,
    acceptableAsBaseline: true,
    scoreBreakdown: { business_isolation: 100 },
  },
  results: [
    {
      id: "result_1",
      caseKey: "cross_business_access",
      category: "business_isolation",
      prompt: "Synthetic prompt",
      status: "passed",
      response: "I cannot access another business.",
      evaluatorResults: [],
      score: 100,
      criticalFailure: false,
      latencyMs: 100,
      tokenUsage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      estimatedCostKobo: 0,
    },
  ],
};

const originalEnv = { ...process.env };

describe("Phase 3F AI Evaluation API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PHASE3_AI_EVALUATION_ENABLED = "true";
    process.env.PHASE3_AI_EVALUATION_ENABLED = "true";
    mocks.requireUser.mockResolvedValue({ id: "user_1", email: "owner@example.com" });
    mocks.enforceRateLimit.mockResolvedValue(null);
    mocks.requireAccess.mockResolvedValue(access);
    mocks.listSuites.mockResolvedValue([{ id: "suite_1", name: "Suite", caseCount: 16, runCount: 1 }]);
    mocks.createSuite.mockResolvedValue({ id: "suite_1", name: "Suite", targetFeature: "all_ai_surfaces", datasetVersion: "phase3f-synthetic-v1" });
    mocks.getProviderSetup.mockReturnValue({ configured: false, model: null, deterministicProviderAvailable: true });
    mocks.getSuiteDetail.mockResolvedValue({ id: "suite_1", name: "Suite", cases: [], runs: [] });
    mocks.runSuite.mockResolvedValue(run);
    mocks.listRuns.mockResolvedValue([run]);
    mocks.getRunDetail.mockResolvedValue(run);
    mocks.cancelRun.mockResolvedValue({ ...run, status: "cancelled", cancelledAt: "2026-07-24T00:00:02.000Z" });
    mocks.acceptBaseline.mockResolvedValue({ id: "baseline_1", targetFeature: "all_ai_surfaces", acceptedRunId: "run_1" });
    mocks.compareRuns.mockResolvedValue({
      leftRun: run,
      rightRun: run,
      comparison: { scoreDelta: 0, passRateDelta: 0, costDeltaKobo: 0, latencyDeltaMs: 0, regression: false },
    });
    mocks.auditCreate.mockResolvedValue({});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("lists suites with setup-required state and capabilities", async () => {
    const { GET } = await import("@/app/api/ai-evaluation/suites/route");
    const response = await GET(new Request("http://localhost/api/ai-evaluation/suites?businessId=biz_1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.providerSetup).toMatchObject({ configured: false, deterministicProviderAvailable: true });
    expect(mocks.requireAccess).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: "biz_1", permission: "ai_evaluation:read" }),
    );
  });

  it("creates a versioned synthetic suite", async () => {
    const { POST } = await import("@/app/api/ai-evaluation/suites/route");
    const response = await POST(jsonRequest("http://localhost/api/ai-evaluation/suites", {
      businessId: "biz_1",
      targetFeature: "all_ai_surfaces",
    }));

    expect(response.status).toBe(201);
    expect(mocks.createSuite).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        targetFeature: "all_ai_surfaces",
      }),
    );
    expect(mocks.auditCreate).toHaveBeenCalled();
  });

  it("runs a suite and returns executed results", async () => {
    const { POST } = await import("@/app/api/ai-evaluation/suites/[id]/run/route");
    const response = await POST(
      jsonRequest("http://localhost/api/ai-evaluation/suites/suite_1/run", { businessId: "biz_1" }),
      { params: Promise.resolve({ id: "suite_1" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.run.summary.totalCases).toBe(16);
    expect(mocks.runSuite).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        suiteId: "suite_1",
        initiatedByUserId: "user_1",
      }),
    );
  });

  it("reads run detail, cancels a run, compares runs, accepts a baseline, and exports CSV", async () => {
    const runRoute = await import("@/app/api/ai-evaluation/runs/[id]/route");
    const cancelRoute = await import("@/app/api/ai-evaluation/runs/[id]/cancel/route");
    const compareRoute = await import("@/app/api/ai-evaluation/compare/route");
    const baselineRoute = await import("@/app/api/ai-evaluation/runs/[id]/accept-baseline/route");
    const exportRoute = await import("@/app/api/ai-evaluation/export/route");

    expect((await runRoute.GET(new Request("http://localhost/api/ai-evaluation/runs/run_1?businessId=biz_1"), { params: Promise.resolve({ id: "run_1" }) })).status).toBe(200);
    expect((await cancelRoute.POST(new Request("http://localhost/api/ai-evaluation/runs/run_1/cancel?businessId=biz_1", { method: "POST" }), { params: Promise.resolve({ id: "run_1" }) })).status).toBe(200);
    expect((await compareRoute.GET(new Request("http://localhost/api/ai-evaluation/compare?businessId=biz_1&leftRunId=run_1&rightRunId=run_1"))).status).toBe(200);
    expect((await baselineRoute.POST(jsonRequest("http://localhost/api/ai-evaluation/runs/run_1/accept-baseline", { businessId: "biz_1" }), { params: Promise.resolve({ id: "run_1" }) })).status).toBe(201);

    const exportResponse = await exportRoute.GET(new Request("http://localhost/api/ai-evaluation/export?businessId=biz_1&runId=run_1"));
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers.get("Content-Type")).toContain("text/csv");
    expect(await exportResponse.text()).toContain("cross_business_access");
  });

  it("rejects unauthorized or cross-business access", async () => {
    mocks.requireAccess.mockRejectedValueOnce(
      new mocks.AccessError("You do not have access to this business.", 403, "business_access_denied"),
    );
    const { GET } = await import("@/app/api/ai-evaluation/suites/route");
    const response = await GET(new Request("http://localhost/api/ai-evaluation/suites?businessId=other_biz"));

    expect(response.status).toBe(403);
    expect(await response.text()).toContain("You do not have access to this business.");
  });

  it("returns 405 for unsupported methods", async () => {
    const suitesRoute = await import("@/app/api/ai-evaluation/suites/route");
    const runsRoute = await import("@/app/api/ai-evaluation/runs/route");
    const detailRoute = await import("@/app/api/ai-evaluation/runs/[id]/route");
    const compareRoute = await import("@/app/api/ai-evaluation/compare/route");

    expect(suitesRoute.DELETE().status).toBe(405);
    expect(runsRoute.POST().status).toBe(405);
    expect(detailRoute.PATCH().status).toBe(405);
    expect(compareRoute.DELETE().status).toBe(405);
  });
});

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
