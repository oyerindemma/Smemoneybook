import { expect, test } from "@playwright/test";

const flagsEnabled = [
  "NEXT_PUBLIC_PHASE3_EXECUTIVE_DASHBOARD_ENABLED",
  "PHASE3_EXECUTIVE_DASHBOARD_ENABLED",
].every((key) => ["1", "true", "yes", "on"].includes(String(process.env[key] ?? "").toLowerCase()));

test.describe("Executive Dashboard Preview workflow", () => {
  test.skip(!flagsEnabled, "Executive Dashboard Preview flags are not enabled for this test run.");

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

  test("loads metrics, changes period, drills down, exports, and avoids write controls", async ({ page }) => {
    const unexpectedFailures: string[] = [];
    let exportRequested = false;
    let drilldownRequested = false;
    let refreshRequested = false;

    page.on("response", (response) => {
      if (
        (response.url().includes("/more/executive-dashboard") || response.url().includes("/api/executive-dashboard")) &&
        [404, 500].includes(response.status())
      ) {
        unexpectedFailures.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.route("**/api/executive-dashboard/summary?**", async (route) => {
      const url = new URL(route.request().url());
      const preset = url.searchParams.get("preset") ?? "this_month";

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ dashboard: summaryForPreset(preset) }),
      });
    });
    await page.route("**/api/executive-dashboard/refresh?**", async (route) => {
      refreshRequested = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ dashboard: summaryForPreset("this_month"), message: "Executive Dashboard refreshed." }),
      });
    });
    await page.route("**/api/executive-dashboard/drilldown?**", async (route) => {
      drilldownRequested = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          drilldown: {
            type: "revenue",
            period: baseSummary.period,
            generatedAt: baseSummary.generatedAt,
            rows: [{ id: "sale_1", description: "Retail sales", amount: 120000, occurredAt: "2026-07-10T00:00:00.000Z" }],
            total: 1,
            dataQualityStatus: "complete",
          },
        }),
      });
    });
    await page.route("**/api/executive-dashboard/export?**", async (route) => {
      exportRequested = true;
      await route.fulfill({
        status: 200,
        contentType: "text/csv",
        headers: { "Content-Disposition": 'attachment; filename="executive-dashboard.csv"' },
        body: "section,metric,value\nheadline,sales,120000\n",
      });
    });

    const moreResponse = await page.goto("/more");
    expect(moreResponse?.status()).not.toBe(404);
    expect(moreResponse?.status()).toBeLessThan(500);
    await expect(page.locator('a[href="/more/executive-dashboard"]')).toContainText("Preview");
    await page.locator('a[href="/more/executive-dashboard"]').click();

    await expect(page.getByRole("heading", { name: "Owner decision view" })).toBeVisible();
    await expect(page.getByText("Sales").first()).toBeVisible();
    await expect(page.getByText("Expenses").first()).toBeVisible();
    await expect(page.getByText("Profit").first()).toBeVisible();
    await expect(page.getByText("Attention required")).toBeVisible();
    await expect(page.getByText("Data quality")).toBeVisible();
    await expect(page.getByText("Bank entries remain unmatched.")).toBeVisible();

    await page.getByRole("combobox", { name: "Period" }).selectOption("previous_month");
    await expect(page.getByText("insufficient data").first()).toBeVisible();

    await page.getByRole("button", { name: "Refresh Executive Dashboard" }).click();
    await expect.poll(() => refreshRequested).toBe(true);

    await page.getByRole("button", { name: "Sales" }).first().click();
    await expect.poll(() => drilldownRequested).toBe(true);
    await expect(page.getByText("Drill-down")).toBeVisible();
    await expect(page.getByText("Retail sales")).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Executive Dashboard" }).click();
    await downloadPromise;
    expect(exportRequested).toBe(true);

    await expect(page.getByRole("button", { name: /^Save$/ })).toHaveCount(0);
    expect(unexpectedFailures).toEqual([]);
  });
});

async function mockDashboard(page: import("@playwright/test").Page) {
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
            canViewExecutiveDashboard: true,
            canExportExecutiveDashboard: true,
            canViewExecutiveDashboardSensitive: true,
            canViewExecutiveDashboardStaffSummary: true,
          },
          billing: {
            planId: "pro",
            planName: "Pro",
            features: ["executive_dashboard", "advanced_reports"],
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

function summaryForPreset(preset: string) {
  if (preset === "previous_month") {
    return {
      ...baseSummary,
      period: { ...baseSummary.period, preset: "previous_month", label: "Previous month" },
      headline: {
        ...baseSummary.headline,
        sales: metric(0, "money", "insufficient_data"),
        expenses: metric(0, "money", "insufficient_data"),
        profit: metric(0, "money", "insufficient_data"),
      },
      attentionQueue: [],
      dataQuality: {
        status: "insufficient_data",
        notes: ["No transactions were recorded for this period."],
        incompleteMetricCount: 3,
      },
    };
  }

  return baseSummary;
}

const basePeriod = {
  preset: "this_month",
  label: "This month",
  start: "2026-07-01T00:00:00.000Z",
  end: "2026-08-01T00:00:00.000Z",
};

const comparisonPeriod = {
  preset: "custom",
  label: "Previous this month",
  start: "2026-06-01T00:00:00.000Z",
  end: "2026-07-01T00:00:00.000Z",
};

const baseSummary = {
  metricVersion: "executive-dashboard-v2",
  business: { id: "biz_1", name: "Preview Shop", currency: "NGN" },
  location: { id: "loc_main", name: "Main shop" },
  period: basePeriod,
  comparisonPeriod,
  generatedAt: "2026-07-24T12:00:00.000Z",
  headline: {
    sales: metric(120000),
    expenses: metric(45000),
    profit: metric(30000),
    customersOwing: metric(25000),
    supplierBills: metric(15000),
    stockValue: metric(90000),
    bankEntriesToReview: metric(4, "count", "partial"),
    taxItemsToReview: metric(2, "count", "partial"),
  },
  revenue: {
    totalSales: metric(120000),
    paidSales: metric(90000),
    creditSales: metric(30000),
    averageSaleValue: metric(30000),
  },
  expenses: {
    totalExpenses: metric(45000),
    categories: [{ label: "Supplies", value: 30000, count: 2 }],
    recurringTrend: metric(45000, "money", "partial"),
  },
  profit: {
    recordedGrossProfit: metric(75000),
    estimatedNetOperatingResult: metric(30000),
    marginPercentage: metric(62.5, "percent"),
    assumptions: ["Profit uses recorded sales profit minus recorded expenses."],
  },
  cash: {
    recordedInflows: metric(90000),
    recordedOutflows: metric(45000),
    netMovement: metric(45000),
    bankReconciledAmount: metric(70000, "money", "partial"),
    bankUnreconciledAmount: metric(20000, "money", "partial"),
    disclosure: "Bank balance is not shown because imported statements are not an authoritative live bank balance.",
  },
  receivables: {
    totalCustomerDebt: metric(25000, "money", "partial"),
    overdueCustomerDebt: metric(10000, "money", "partial"),
    ageingBands: [{ label: "0-30 days", value: 25000, count: 1 }],
    topDebtors: [{ label: "Adebayo Stores", value: 25000 }],
  },
  payables: {
    supplierObligations: metric(15000, "money", "partial"),
    overdueObligations: metric(5000, "money", "partial"),
    ageingBands: [{ label: "0-30 days", value: 15000, count: 1 }],
    topSuppliers: [{ label: "Supply Co", value: 15000 }],
  },
  stock: {
    stockCostValue: metric(90000),
    potentialRevenue: metric(130000),
    potentialProfit: metric(40000),
    lowStockItems: metric(3, "count", "partial"),
    slowMovingItems: [{ label: "Beans", value: 12000, count: 5 }],
    warehouseCount: metric(1, "count"),
    pendingTransfers: metric(1, "count"),
  },
  staff: {
    activeStaff: metric(2, "count"),
    salesAttributedToStaff: metric(90000),
    unattributedActivity: metric(1, "count", "partial"),
    operationalActivity: metric(8, "count"),
    restricted: false,
    disclaimer: "Operational activity indicator — not an employment decision.",
  },
  reconciliation: {
    importedAmount: metric(90000),
    matchedAmount: metric(70000, "money", "partial"),
    unmatchedAmount: metric(20000, "money", "partial"),
    duplicateAmount: metric(0),
    reconciliationRate: metric(77.78, "percent", "partial"),
    unresolvedItems: metric(4, "count", "partial"),
  },
  taxReadiness: {
    estimatedVatPosition: metric(6000, "money", "partial"),
    whtRecorded: metric(5000, "money", "partial"),
    unresolvedReviewItems: metric(2, "count", "partial"),
    dataCompleteness: metric(88, "percent", "partial"),
    verifiedRuleSetVersion: metric("ng-federal-2026-preview-v1", "text", "partial"),
  },
  healthIndicators: {
    salesTrend: metric(120000),
    expenseTrend: metric(45000),
    receivablesTrend: metric(25000),
    stockConcentration: metric(42, "percent"),
    reconciliationTrend: metric(77.78, "percent", "partial"),
    dataQualityTrend: metric(70, "percent", "partial"),
  },
  attentionQueue: [
    {
      id: "attention:unreconciled_bank_entries",
      severity: "warning",
      title: "Bank entries to review",
      detail: "Bank entries remain unmatched.",
      count: 4,
      sourceService: "BankStatementImportRow",
      actionLabel: "Review bank entries",
      drilldownType: "reconciliation",
    },
  ],
  dataQuality: {
    status: "partial",
    notes: ["4 bank entries are unreconciled."],
    incompleteMetricCount: 2,
  },
  sourceMetrics: {
    transactionCount: 6,
    saleCount: 4,
    expenseCount: 2,
    openDebtCount: 2,
    inventoryItemCount: 5,
    bankRowCount: 6,
    staffMemberCount: 2,
    taxReviewItemCount: 2,
  },
  freshness: {
    latestTransactionAt: "2026-07-20T00:00:00.000Z",
    latestBankImportAt: "2026-07-20T00:00:00.000Z",
    generatedAt: "2026-07-24T12:00:00.000Z",
    stale: false,
  },
  assumptions: [
    "All figures are based on records currently in SME MoneyBook for the selected business scope.",
    "Bank metrics use imported statements only and do not represent a live bank balance.",
  ],
};

function metric(value: number | string, unit: "money" | "percent" | "count" | "text" = "money", status = "complete") {
  return {
    value,
    period: basePeriod,
    comparisonPeriod,
    comparisonValue: typeof value === "number" ? value * 0.8 : undefined,
    change: typeof value === "number" ? { amount: value * 0.2, percent: 25, direction: "up" } : undefined,
    formulaId: "executive.test.metric",
    sourceService: "ExecutiveDashboard",
    dataQualityStatus: status,
    lastCalculatedAt: "2026-07-24T12:00:00.000Z",
    businessId: "biz_1",
    unit,
  };
}
