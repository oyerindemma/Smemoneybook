import { expect, test, type Page, type Route } from "@playwright/test";

const flagsEnabled = [
  "NEXT_PUBLIC_PHASE3_AI_EVALUATION_ENABLED",
  "PHASE3_AI_EVALUATION_ENABLED",
].every((key) => ["1", "true", "yes", "on"].includes(String(process.env[key] ?? "").toLowerCase()));

test.describe("AI Evaluation Preview workflow", () => {
  test.skip(!flagsEnabled, "AI Evaluation Preview flags are not enabled for this test run.");

  test.beforeEach(async ({ page }) => {
    await mockDashboard(page);
    await page.route("**/api/billing/status", async (route) => {
      await json(route, 200, { billingLive: true, provider: "paystack" });
    });
  });

  test("runs suite, inspects results, compares, accepts baseline, and exports", async ({ page }) => {
    const unexpectedFailures: string[] = [];
    const state = createAiEvaluationRouteState();
    await installAiEvaluationRoutes(page, state);

    page.on("response", (response) => {
      if (
        (response.url().includes("/more/ai-evaluation") || response.url().includes("/api/ai-evaluation")) &&
        [404, 500].includes(response.status())
      ) {
        unexpectedFailures.push(`${response.status()} ${response.url()}`);
      }
    });

    const moreResponse = await page.goto("/more");
    expect(moreResponse?.status()).not.toBe(404);
    expect(moreResponse?.status()).toBeLessThan(500);
    await expect(page.locator('a[href="/more/ai-evaluation"]')).toContainText("Preview");
    await page.locator('a[href="/more/ai-evaluation"]').click();

    await expect(page.getByRole("heading", { name: "Model quality controls" })).toBeVisible();
    await expect(page.getByText("Evaluation suites")).toBeVisible();
    await expect(page.getByText("Provider setup required")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Phase 3F synthetic AI governance suite" })).toBeVisible();

    await page.getByRole("button", { name: "Run evaluation" }).click();
    await expect.poll(() => state.runRequested).toBe(true);
    await expect(page.getByText("Latest run status")).toBeVisible();
    await expect(page.getByText("Pass rate")).toBeVisible();
    await expect(page.getByText("Critical failures")).toBeVisible();
    await expect(page.getByText("Score breakdown")).toBeVisible();
    await expect(page.getByRole("button", { name: /tax_missing_receipts/i })).toBeVisible();

    await page.getByRole("button", { name: /tax_missing_receipts/i }).click();
    await expect(page.getByText("Case detail")).toBeVisible();
    await expect(page.getByText("Missing-data disclosure")).toBeVisible();
    await expect(page.getByText("Missing or malformed data was disclosed.")).toBeVisible();

    await page.getByRole("button", { name: "Compare runs" }).click();
    await expect.poll(() => state.compareRequested).toBe(true);
    await expect(page.getByText("No regression")).toBeVisible();

    await page.getByRole("button", { name: "Accept baseline" }).click();
    await expect.poll(() => state.baselineAccepted).toBe(true);

    await page.getByRole("link", { name: "Export report" }).click();
    await expect.poll(() => state.exportRequested).toBe(true);
    expect(unexpectedFailures).toEqual([]);
  });

  test("handles empty state, unauthorized access, business isolation, cancellation, and method guards", async ({ page }) => {
    const state = createAiEvaluationRouteState();
    state.suites = [];
    state.runs = [];
    await installAiEvaluationRoutes(page, state);

    await page.goto("/more/ai-evaluation");
    await expect(page.getByText("No suites yet")).toBeVisible();
    await expect(page.getByText("Empty state: no AI evaluation runs have been recorded.")).toBeVisible();

    await page.getByRole("button", { name: "Create suite" }).click();
    await expect.poll(() => state.suites.length).toBe(1);
    await page.getByRole("button", { name: "Run evaluation" }).click();
    await expect.poll(() => state.runRequested).toBe(true);
    await page.getByRole("button", { name: "Cancel run" }).click();
    await expect.poll(() => state.cancelRequested).toBe(true);
    await expect(page.getByRole("heading", { name: "Cancelled" })).toBeVisible();

    state.forceUnauthorized = true;
    await page.getByRole("button", { name: "Run evaluation" }).click();
    await expect(page.getByText("You do not have permission to view AI Evaluation.")).toBeVisible();
    state.forceUnauthorized = false;

    const checks = await page.evaluate(async () => {
      const isolation = await fetch("/api/ai-evaluation/suites?businessId=other_biz");
      const statuses = await Promise.all([
        fetch("/api/ai-evaluation/suites?businessId=biz_1", { method: "DELETE" }),
        fetch("/api/ai-evaluation/runs?businessId=biz_1", { method: "POST" }),
        fetch("/api/ai-evaluation/runs/run_1?businessId=biz_1", { method: "PATCH" }),
        fetch("/api/ai-evaluation/compare?businessId=biz_1", { method: "DELETE" }),
      ]);
      return {
        isolationStatus: isolation.status,
        isolationBody: await isolation.text(),
        methodStatuses: statuses.map((response) => response.status),
      };
    });

    expect(checks.isolationStatus).toBe(403);
    expect(checks.isolationBody).toContain("You do not have access to this business.");
    expect(checks.methodStatuses).toEqual([405, 405, 405, 405]);
  });
});

async function mockDashboard(page: Page) {
  await page.route("**/api/dashboard/summary**", async (route) => {
    await json(route, 200, {
      state: {
        businessId: "biz_1",
        businessName: "Preview Shop",
        currency: "NGN",
        businessRole: "owner",
        onboardingCompleted: true,
        businesses: [{ id: "biz_1", name: "Preview Shop", role: "owner" }],
        locations: [{ id: "loc_main", name: "Main shop", type: "main_shop", isDefault: true }],
        selectedLocationId: "loc_main",
        selectedLocationName: "Main shop",
        permissions: {
          canManageStaff: true,
          canManageAccounts: true,
          canSaveReports: true,
          canExportBackup: true,
          canViewAiEvaluation: true,
          canRunAiEvaluation: true,
          canManageAiEvaluationCases: true,
          canExportAiEvaluation: true,
          canCompareAiEvaluationModels: true,
        },
        billing: {
          planId: "pro",
          planName: "Pro",
          features: ["ai_evaluation", "advanced_reports", "granular_permissions", "audit_tools"],
        },
        accounts: [],
        transactions: [],
        debts: [],
        items: [],
        auditLogs: [],
      },
    });
  });
}

type AiEvaluationRouteState = {
  suites: SuitePayload[];
  runs: RunPayload[];
  runRequested: boolean;
  cancelRequested: boolean;
  compareRequested: boolean;
  baselineAccepted: boolean;
  exportRequested: boolean;
  forceUnauthorized: boolean;
};

function createAiEvaluationRouteState(): AiEvaluationRouteState {
  return {
    suites: [suitePayload],
    runs: [],
    runRequested: false,
    cancelRequested: false,
    compareRequested: false,
    baselineAccepted: false,
    exportRequested: false,
    forceUnauthorized: false,
  };
}

async function installAiEvaluationRoutes(page: Page, state: AiEvaluationRouteState) {
  await page.route("**/api/ai-evaluation**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const businessId = url.searchParams.get("businessId") ?? readBodyBusinessId(request.postData());

    if (state.forceUnauthorized) {
      await json(route, 403, { error: "You do not have permission to view AI Evaluation." });
      return;
    }

    if (businessId && businessId !== "biz_1") {
      await json(route, 403, { error: "You do not have access to this business." });
      return;
    }

    if (url.pathname === "/api/ai-evaluation/suites") {
      if (method === "GET") {
        await json(route, 200, {
          suites: state.suites,
          providerSetup: { configured: false, model: null, deterministicProviderAvailable: true },
          capabilities,
        });
        return;
      }

      if (method === "POST") {
        state.suites = [suitePayload];
        await json(route, 201, { suite: suitePayload, capabilities });
        return;
      }

      await methodNotAllowed(route, "GET, POST");
      return;
    }

    const runSuiteMatch = url.pathname.match(/^\/api\/ai-evaluation\/suites\/([^/]+)\/run$/);
    if (runSuiteMatch) {
      if (method !== "POST") {
        await methodNotAllowed(route, "POST");
        return;
      }

      state.runRequested = true;
      state.runs = [runPayload()];
      await json(route, 201, { run: state.runs[0], capabilities });
      return;
    }

    if (url.pathname === "/api/ai-evaluation/runs") {
      if (method !== "GET") {
        await methodNotAllowed(route, "GET");
        return;
      }

      await json(route, 200, { runs: state.runs, capabilities });
      return;
    }

    const cancelMatch = url.pathname.match(/^\/api\/ai-evaluation\/runs\/([^/]+)\/cancel$/);
    if (cancelMatch) {
      if (method !== "POST") {
        await methodNotAllowed(route, "POST");
        return;
      }

      state.cancelRequested = true;
      state.runs = [{ ...runPayload(), status: "cancelled", cancelledAt: "2026-07-24T00:00:02.000Z" }];
      await json(route, 200, { run: state.runs[0], capabilities });
      return;
    }

    const baselineMatch = url.pathname.match(/^\/api\/ai-evaluation\/runs\/([^/]+)\/accept-baseline$/);
    if (baselineMatch) {
      if (method !== "POST") {
        await methodNotAllowed(route, "POST");
        return;
      }

      state.baselineAccepted = true;
      await json(route, 201, { baseline: { id: "baseline_1", acceptedRunId: "run_1" }, capabilities });
      return;
    }

    const runDetailMatch = url.pathname.match(/^\/api\/ai-evaluation\/runs\/([^/]+)$/);
    if (runDetailMatch) {
      if (method !== "GET") {
        await methodNotAllowed(route, "GET");
        return;
      }

      await json(route, 200, { run: state.runs[0] ?? runPayload(), capabilities });
      return;
    }

    if (url.pathname === "/api/ai-evaluation/compare") {
      if (method !== "GET") {
        await methodNotAllowed(route, "GET");
        return;
      }

      state.compareRequested = true;
      await json(route, 200, {
        comparison: {
          leftRun: runPayload(),
          rightRun: runPayload(),
          comparison: { scoreDelta: 0, passRateDelta: 0, costDeltaKobo: 0, latencyDeltaMs: 0, regression: false },
        },
        capabilities,
      });
      return;
    }

    if (url.pathname === "/api/ai-evaluation/export") {
      if (method !== "GET") {
        await methodNotAllowed(route, "GET");
        return;
      }

      state.exportRequested = true;
      await route.fulfill({
        status: 200,
        contentType: "text/csv",
        headers: { "Content-Disposition": 'attachment; filename="ai-evaluation.csv"' },
        body: "case_key,status\ntax_missing_receipts,needs_review\n",
      });
      return;
    }

    await json(route, 404, { error: "Not found." });
  });
}

const capabilities = {
  canRead: true,
  canRun: true,
  canManageCases: true,
  canExport: true,
  canCompareModels: true,
};

type SuitePayload = {
  id: string;
  name: string;
  targetFeature: string;
  status: string;
  datasetVersion: string;
  caseCount: number;
  runCount: number;
};

const suitePayload: SuitePayload = {
  id: "suite_1",
  name: "Phase 3F synthetic AI governance suite",
  targetFeature: "all_ai_surfaces",
  status: "active",
  datasetVersion: "phase3f-synthetic-v1",
  caseCount: 16,
  runCount: 1,
};

type RunPayload = {
  id: string;
  status: string;
  model: string;
  promptVersion: string;
  toolVersion: string;
  datasetVersion: string;
  startedAt: string;
  completedAt?: string;
  cancelledAt?: string;
  baseline?: boolean;
  suite: { id: string; name: string; targetFeature: string };
  summary: Record<string, unknown>;
  results: Array<Record<string, unknown>>;
};

function runPayload(): RunPayload {
  return {
    id: "run_1",
    status: "completed",
    model: "deterministic-grounded-preview",
    promptVersion: "phase3f-evaluation-preview-v1",
    toolVersion: "phase3-ai-tools-v1",
    datasetVersion: "phase3f-synthetic-v1",
    startedAt: "2026-07-24T00:00:00.000Z",
    completedAt: "2026-07-24T00:00:01.000Z",
    suite: { id: "suite_1", name: suitePayload.name, targetFeature: "all_ai_surfaces" },
    summary: {
      totalCases: 16,
      passedCases: 15,
      failedCases: 0,
      needsReviewCases: 1,
      criticalFailures: 0,
      passRate: 100,
      aggregateScore: 96,
      totalCostKobo: 120,
      totalTokens: 1200,
      averageLatencyMs: 300,
      p95LatencyMs: 700,
      acceptableAsBaseline: true,
      scoreBreakdown: { missing_data_disclosure: 100, business_isolation: 100 },
    },
    results: [
      {
        id: "result_1",
        caseKey: "tax_missing_receipts",
        category: "missing_data_disclosure",
        prompt: "Synthetic missing receipt prompt",
        status: "needs_review",
        response: "Four expenses are missing receipt evidence and need review.",
        evaluatorResults: [
          {
            id: "missing_data_disclosure",
            label: "Missing-data disclosure",
            passed: true,
            score: 100,
            critical: false,
            detail: "Missing or malformed data was disclosed.",
          },
        ],
        score: 92,
        criticalFailure: false,
        latencyMs: 300,
        tokenUsage: { totalTokens: 200 },
        estimatedCostKobo: 10,
      },
      {
        id: "result_2",
        caseKey: "cross_business_access",
        category: "business_isolation",
        prompt: "Synthetic isolation prompt",
        status: "passed",
        response: "I cannot access another business.",
        evaluatorResults: [],
        score: 100,
        criticalFailure: false,
        latencyMs: 100,
        tokenUsage: { totalTokens: 80 },
        estimatedCostKobo: 0,
      },
    ],
  };
}

async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function methodNotAllowed(route: Route, allow: string) {
  await route.fulfill({
    status: 405,
    contentType: "application/json",
    headers: { Allow: allow },
    body: JSON.stringify({ error: "Method not allowed." }),
  });
}

function readBodyBusinessId(body: string | null) {
  if (!body) {
    return "";
  }

  try {
    const parsed = JSON.parse(body) as { businessId?: unknown };
    return typeof parsed.businessId === "string" ? parsed.businessId : "";
  } catch {
    return "";
  }
}
