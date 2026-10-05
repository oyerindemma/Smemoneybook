import { expect, test, type Page, type Route } from "@playwright/test";

const flagsEnabled = [
  "NEXT_PUBLIC_PHASE3_PREDICTIVE_ALERTS_ENABLED",
  "PHASE3_PREDICTIVE_ALERTS_ENABLED",
].every((key) => ["1", "true", "yes", "on"].includes(String(process.env[key] ?? "").toLowerCase()));

test.describe("Predictive Alerts Preview workflow", () => {
  test.skip(!flagsEnabled, "Predictive Alerts Preview flags are not enabled for this test run.");

  test.beforeEach(async ({ page }) => {
    await mockDashboard(page);
    await page.route("**/api/billing/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ billingLive: true, provider: "paystack" }),
      });
    });
  });

  test("navigates, filters, opens evidence, updates lifecycle, changes preferences, and exports", async ({ page }) => {
    const unexpectedFailures: string[] = [];
    const state = createPredictiveRouteState();
    await installPredictiveAlertRoutes(page, state);

    page.on("response", (response) => {
      if (
        (response.url().includes("/more/predictive-alerts") || response.url().includes("/api/predictive-alerts")) &&
        [404, 500].includes(response.status())
      ) {
        unexpectedFailures.push(`${response.status()} ${response.url()}`);
      }
    });

    const moreResponse = await page.goto("/more");
    expect(moreResponse?.status()).not.toBe(404);
    expect(moreResponse?.status()).toBeLessThan(500);
    await expect(page.locator('a[href="/more/predictive-alerts"]')).toContainText("Preview");
    await page.locator('a[href="/more/predictive-alerts"]').click();

    await expect(page.getByRole("heading", { name: "Business risk signals" })).toBeVisible();
    await expect(page.getByText("3 active")).toBeVisible();
    await expect(page.getByRole("button", { name: /Recorded sales declined/i })).toBeVisible();
    await expect(page.getByText("Evidence panel")).toBeVisible();
    await expect(page.getByText("Current Sales")).toBeVisible();
    await expect(page.getByText("30000")).toBeVisible();

    await page.getByLabel("Date range").selectOption("14");
    await expect.poll(() => state.lastListPeriodDays).toBe("14");
    await expect(page.getByRole("button", { name: /Low stock needs review/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Recorded sales declined/i })).toHaveCount(0);

    await page.getByLabel("Date range").selectOption("30");
    await page.getByLabel("Category").selectOption("staff_attribution_anomalies");
    await page.getByRole("button", { name: /Staff attribution is incomplete/i }).click();
    const evidencePanel = page.getByRole("heading", { name: "Evidence panel" }).locator("xpath=ancestor::section[1]");
    await expect(evidencePanel.getByText("Operational activity lacks reliable staff attribution.")).toBeVisible();
    await expect(evidencePanel.getByText("not an employment decision")).toBeVisible();

    await page.getByLabel("Category").selectOption("supplier_payment_pressure");
    await expect(page.getByText("No active predictive alerts for this scope.")).toBeVisible();
    await expect(page.getByText("No resolved or dismissed alerts yet.")).toBeVisible();

    await page.getByLabel("Category").selectOption("all");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export" }).click();
    await downloadPromise;
    expect(state.exportRequested).toBe(true);

    await page.getByRole("button", { name: "Evaluate" }).click();
    await expect.poll(() => state.evaluateRequested).toBe(true);
    await expect(page.getByText("Core source checks passed for Preview QA.")).toBeVisible();

    await page.getByRole("button", { name: /Recorded sales declined/i }).click();
    await page.getByRole("button", { name: "Acknowledge" }).click();
    await expect.poll(() => state.lifecycleActions).toContain("acknowledge");

    await page.getByRole("button", { name: /Low stock needs review/i }).click();
    await page.getByLabel("Dismiss reason").fill("Reviewed in Preview QA.");
    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect.poll(() => state.lifecycleActions).toContain("dismiss");

    await page.getByRole("button", { name: /Tax-readiness items need review/i }).click();
    await page.getByRole("button", { name: "Reopen" }).click();
    await expect.poll(() => state.lifecycleActions).toContain("reopen");

    await page.locator("label", { hasText: "Sales Decline" }).getByRole("checkbox").click();
    await expect.poll(() => state.preferenceUpdates).toBe(1);
    expect(state.lastPreferencePayload?.preferences[0]).toEqual(
      expect.objectContaining({ ruleKey: "sales_decline", enabled: false }),
    );

    await expect(page.getByRole("button", { name: /^Save$/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Pay$/ })).toHaveCount(0);
    expect(unexpectedFailures).toEqual([]);
  });

  test("handles empty state, unauthorized access, business isolation, and method guards", async ({ page }) => {
    const state = createPredictiveRouteState();
    state.activeAlerts = [];
    state.historyAlerts = [];
    await installPredictiveAlertRoutes(page, state);

    await page.goto("/more/predictive-alerts");
    await expect(page.getByText("No active predictive alerts for this scope.")).toBeVisible();
    await expect(page.getByText("No resolved or dismissed alerts yet.")).toBeVisible();

    state.forceUnauthorized = true;
    await page.getByRole("button", { name: "Evaluate" }).click();
    await expect(page.getByText("You do not have permission to view Predictive Alerts.")).toBeVisible();
    state.forceUnauthorized = false;

    const isolation = await page.evaluate(async () => {
      const response = await fetch("/api/predictive-alerts?businessId=other_biz");
      return { status: response.status, body: await response.text() };
    });
    expect(isolation.status).toBe(403);
    expect(isolation.body).toContain("You do not have access to this business.");

    const methodStatuses = await page.evaluate(async () => {
      const checks = await Promise.all([
        fetch("/api/predictive-alerts?businessId=biz_1", { method: "POST" }),
        fetch("/api/predictive-alerts?businessId=biz_1", { method: "PUT" }),
        fetch("/api/predictive-alerts?businessId=biz_1", { method: "PATCH" }),
        fetch("/api/predictive-alerts?businessId=biz_1", { method: "DELETE" }),
        fetch("/api/predictive-alerts/alert_sales?businessId=biz_1", { method: "POST" }),
        fetch("/api/predictive-alerts/evaluate?businessId=biz_1", { method: "GET" }),
      ]);
      return checks.map((response) => response.status);
    });
    expect(methodStatuses).toEqual([405, 405, 405, 405, 405, 405]);
  });
});

async function mockDashboard(page: Page) {
  await page.route("**/api/dashboard/summary**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
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
            canViewLocations: true,
            canManageLocations: true,
            canViewTransfers: true,
            canManageTransfers: true,
            canApproveTransfers: true,
            canReceiveTransfers: true,
            canManageTax: true,
            canViewPredictiveAlerts: true,
            canManagePredictiveAlerts: true,
            canAcknowledgePredictiveAlerts: true,
            canExportPredictiveAlerts: true,
          },
          billing: {
            planId: "pro",
            planName: "Pro",
            features: ["predictive_alerts", "advanced_reports", "team_management"],
          },
          accounts: [],
          transactions: [],
          debts: [],
          items: [],
          auditLogs: [],
        },
      }),
    });
  });
}

type PredictiveRouteState = {
  activeAlerts: AlertPayload[];
  historyAlerts: AlertPayload[];
  evaluateRequested: boolean;
  exportRequested: boolean;
  lifecycleActions: string[];
  preferenceUpdates: number;
  lastPreferencePayload: { preferences: Array<Record<string, unknown>> } | null;
  lastListPeriodDays: string | null;
  forceUnauthorized: boolean;
};

function createPredictiveRouteState(): PredictiveRouteState {
  return {
    activeAlerts: [
      alertPayload("alert_sales", "sales_decline", "sales_decline", "high", "Recorded sales declined", "Sales decreased by 55%."),
      alertPayload("alert_stock", "low_stock_risk", "low_stock", "medium", "Low stock needs review", "Fast Rice is below reorder level."),
      alertPayload(
        "alert_staff",
        "staff_attribution_anomaly",
        "staff_attribution_anomalies",
        "low",
        "Staff attribution is incomplete",
        "Operational activity lacks reliable staff attribution.",
      ),
    ],
    historyAlerts: [
      {
        ...alertPayload(
          "alert_tax",
          "tax_readiness_gap",
          "tax_readiness_issues",
          "medium",
          "Tax-readiness items need review",
          "Tax Assistant review items remain open.",
        ),
        lifecycleStatus: "resolved",
        legacyStatus: "resolved",
      },
    ],
    evaluateRequested: false,
    exportRequested: false,
    lifecycleActions: [],
    preferenceUpdates: 0,
    lastPreferencePayload: null,
    lastListPeriodDays: null,
    forceUnauthorized: false,
  };
}

async function installPredictiveAlertRoutes(page: Page, state: PredictiveRouteState) {
  await page.route("**/api/predictive-alerts**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const businessId = url.searchParams.get("businessId");

    if (state.forceUnauthorized) {
      await json(route, 403, { error: "You do not have permission to view Predictive Alerts." });
      return;
    }

    if (businessId && businessId !== "biz_1") {
      await json(route, 403, { error: "You do not have access to this business." });
      return;
    }

    if (url.pathname === "/api/predictive-alerts") {
      if (method !== "GET") {
        await methodNotAllowed(route, "GET");
        return;
      }

      const periodDays = url.searchParams.get("periodDays") ?? "30";
      state.lastListPeriodDays = periodDays;
      const statuses = new Set((url.searchParams.get("status") ?? "active,acknowledged").split(","));
      const category = url.searchParams.get("category");
      const baseAlerts = statuses.has("resolved") || statuses.has("dismissed")
        ? state.historyAlerts
        : periodDays === "14"
          ? state.activeAlerts.filter((alert) => alert.ruleKey === "low_stock_risk")
          : state.activeAlerts;
      const alerts = baseAlerts.filter((alert) => !category || alert.category === category);

      await json(route, 200, {
        alerts,
        capabilities: {
          canManage: true,
          canAcknowledge: true,
          canExport: true,
          delivery: { inApp: true, email: false, whatsapp: false },
        },
      });
      return;
    }

    if (url.pathname === "/api/predictive-alerts/preferences") {
      if (method === "GET") {
        await json(route, 200, {
          preferences: preferencesPayload,
          delivery: { inApp: true, email: false, whatsapp: false },
        });
        return;
      }

      if (method === "PUT") {
        state.preferenceUpdates += 1;
        state.lastPreferencePayload = JSON.parse(request.postData() ?? "{}") as PredictiveRouteState["lastPreferencePayload"];
        await json(route, 200, { preferences: preferencesPayload, message: "Predictive Alert preferences updated." });
        return;
      }

      await methodNotAllowed(route, "GET, PUT");
      return;
    }

    if (url.pathname === "/api/predictive-alerts/evaluate") {
      if (method !== "POST") {
        await methodNotAllowed(route, "POST");
        return;
      }

      state.evaluateRequested = true;
      await json(route, 200, {
        alerts: state.activeAlerts,
        generatedCount: state.activeAlerts.length,
        resolvedCount: 0,
        dataQuality: { status: "complete", notes: ["Core source checks passed for Preview QA."] },
        message: "Predictive Alerts evaluated.",
      });
      return;
    }

    if (url.pathname === "/api/predictive-alerts/export") {
      if (method !== "GET") {
        await methodNotAllowed(route, "GET");
        return;
      }

      state.exportRequested = true;
      await route.fulfill({
        status: 200,
        contentType: "text/csv",
        headers: { "Content-Disposition": 'attachment; filename="predictive-alerts.csv"' },
        body: "rule_key,title\nsales_decline,Recorded sales declined\n",
      });
      return;
    }

    const actionMatch = url.pathname.match(/^\/api\/predictive-alerts\/([^/]+)\/(acknowledge|dismiss|reopen)$/);
    if (actionMatch) {
      if (method !== "POST") {
        await methodNotAllowed(route, "POST");
        return;
      }

      const [, alertId, action] = actionMatch;
      state.lifecycleActions.push(action);
      const alert = findAlert(state, alertId);

      if (action === "acknowledge" && alert) {
        alert.lifecycleStatus = "acknowledged";
        alert.legacyStatus = "confirmed";
      }

      if (action === "dismiss" && alert) {
        alert.lifecycleStatus = "dismissed";
        alert.legacyStatus = "dismissed";
        state.activeAlerts = state.activeAlerts.filter((item) => item.id !== alert.id);
        state.historyAlerts = [alert, ...state.historyAlerts];
      }

      if (action === "reopen" && alert) {
        alert.lifecycleStatus = "active";
        alert.legacyStatus = "active";
        state.historyAlerts = state.historyAlerts.filter((item) => item.id !== alert.id);
        state.activeAlerts = [alert, ...state.activeAlerts];
      }

      await json(route, 200, { alert, message: `Predictive Alert ${action}.` });
      return;
    }

    const detailMatch = url.pathname.match(/^\/api\/predictive-alerts\/([^/]+)$/);
    if (detailMatch) {
      if (method !== "GET") {
        await methodNotAllowed(route, "GET");
        return;
      }

      await json(route, 200, { alert: findAlert(state, detailMatch[1]) });
      return;
    }

    await json(route, 404, { error: "Not found." });
  });
}

function alertPayload(
  id: string,
  ruleKey: string,
  category: string,
  severity: "critical" | "high" | "medium" | "low" | "information",
  title: string,
  explanation: string,
) {
  return {
    id,
    businessId: "biz_1",
    locationId: "loc_main",
    alertKey: `${ruleKey}:loc_main`,
    ruleKey,
    category,
    severity,
    title,
    explanation,
    recommendedAction: "Review the source records before taking manual action.",
    evidence: {
      whatChanged: explanation,
      comparedPeriod: "Current period compared with the previous period.",
      metricValues: {
        currentSales: 30000,
        previousSales: 70000,
        affectedRecords: 3,
      },
      threshold: { minimumDropAmount: 20000 },
      formula: "previousSales - currentSales >= minimumDropAmount",
      sourceData: ["Transaction", "Debt", "InventoryItem"],
      missingData: ruleKey === "staff_attribution_anomaly" ? ["Some records lack staff attribution."] : [],
      recommendedReviewAction: "Review the source records before taking manual action.",
      disclaimer: ruleKey === "staff_attribution_anomaly"
        ? "This is an operational attribution signal, not an employment decision."
        : "This is deterministic support information.",
    },
    period: {
      label: "last_30_days",
      start: "2026-06-24T12:00:00.000Z",
      end: "2026-07-24T12:00:00.000Z",
      comparisonStart: "2026-05-25T12:00:00.000Z",
      comparisonEnd: "2026-06-24T12:00:00.000Z",
    },
    impactAmount: 40000,
    confidence: 0.82,
    formulaReference: `predictive.${ruleKey}.v2`,
    dedupeKey: `biz_1:${ruleKey}:loc_main`,
    sourceMetrics: { currentSales: 30000, previousSales: 70000 },
    missingData: ruleKey === "staff_attribution_anomaly" ? ["Some records lack staff attribution."] : [],
    delivery: { inApp: true, email: false, whatsapp: false },
    lifecycleStatus: "active",
    legacyStatus: "active",
    legacySeverity: severity === "critical" ? "critical" : severity === "high" || severity === "medium" ? "warning" : "info",
    firstDetectedAt: "2026-07-24T12:00:00.000Z",
    lastDetectedAt: "2026-07-24T12:00:00.000Z",
    createdAt: "2026-07-24T12:00:00.000Z",
    updatedAt: "2026-07-24T12:00:00.000Z",
    deliveryCount: 1,
  };
}

function findAlert(state: PredictiveRouteState, alertId: string) {
  return [...state.activeAlerts, ...state.historyAlerts].find((alert) => alert.id === alertId) ?? null;
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

type AlertPayload = ReturnType<typeof alertPayload>;

const preferencesPayload = [
  preference("sales_decline", "sales_decline", "high"),
  preference("low_stock_risk", "low_stock", "medium"),
  preference("staff_attribution_anomaly", "staff_attribution_anomalies", "low"),
  preference("supplier_payment_pressure", "supplier_payment_pressure", "medium"),
  preference("tax_readiness_gap", "tax_readiness_issues", "medium"),
];

function preference(ruleKey: string, category: string, severity: string) {
  return {
    ruleKey,
    enabled: true,
    thresholdOverride: null,
    inAppEnabled: true,
    emailEnabled: false,
    whatsappEnabled: false,
    category,
    severity,
    description: `${ruleKey} rule`,
    formulaReference: `predictive.${ruleKey}.v2`,
    emailDeliveryAvailable: false,
    whatsappDeliveryAvailable: false,
  };
}
