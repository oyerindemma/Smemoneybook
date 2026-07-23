import { expect, test } from "@playwright/test";

const flagsEnabled = [
  "NEXT_PUBLIC_PHASE3_STAFF_PERFORMANCE_ENABLED",
  "PHASE3_STAFF_PERFORMANCE_ENABLED",
].every((key) => ["1", "true", "yes", "on"].includes(String(process.env[key] ?? "").toLowerCase()));

test.describe("Staff Performance Preview workflow", () => {
  test.skip(!flagsEnabled, "Staff Performance Preview flags are not enabled for this test run.");

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

  test("navigates, filters, opens detail, and starts export", async ({ page }) => {
    let exportRequested = false;

    await page.route("**/api/staff-performance/summary**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ summary: summaryPayload }),
      });
    });
    await page.route("**/api/staff-performance/staff_1**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ row: summaryPayload.rows[0], summary: { ...summaryPayload, rows: [summaryPayload.rows[0]] } }),
      });
    });
    await page.route("**/api/staff-performance/export**", async (route) => {
      exportRequested = true;
      await route.fulfill({
        status: 200,
        contentType: "text/csv",
        headers: { "Content-Disposition": 'attachment; filename="staff-performance.csv"' },
        body: "Staff,Sales\nTunde,12000\n",
      });
    });

    await page.goto("/more");
    await page.locator('a[href="/more/staff-performance"]').click();

    await expect(page.getByRole("heading", { name: "Team operational activity" })).toBeVisible();
    await expect(page.getByText("Operational activity indicator")).toBeVisible();
    await expect(page.getByRole("button", { name: /Tunde/i })).toBeVisible();

    await page.getByLabel("Date range").selectOption("last_7_days");
    await page.getByLabel("Location").selectOption("loc_main");
    await page.getByRole("button", { name: /Tunde/i }).click();
    await expect(page.getByText("Trend comparison")).toBeVisible();

    await page.getByRole("button", { name: /Export/i }).click();
    await expect.poll(() => exportRequested).toBe(true);
  });

  test("shows empty and permission-denied states", async ({ page }) => {
    await page.route("**/api/staff-performance/summary**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ summary: { ...summaryPayload, rows: [], summaryCards: { ...summaryPayload.summaryCards, activeStaff: 0 } } }),
      });
    });

    await page.goto("/more/staff-performance");
    await expect(page.getByText("No attributed staff activity is available for this period.")).toBeVisible();

    await page.unroute("**/api/staff-performance/summary**");
    await page.route("**/api/staff-performance/summary**", async (route) => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "You do not have permission to view Staff Performance." }),
      });
    });

    await page.getByRole("button", { name: /Refresh/i }).click();
    await expect(page.getByText("You do not have permission to view Staff Performance.")).toBeVisible();
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
          locations: [
            { id: "loc_main", name: "Main shop", type: "main_shop", isDefault: true },
            { id: "loc_branch", name: "Branch", type: "branch", isDefault: false },
          ],
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
            canViewStaffPerformance: true,
            canExportStaffPerformance: true,
          },
          billing: {
            planId: "pro",
            planName: "Pro",
            features: ["advanced_reports", "granular_permissions", "audit_tools", "team_management"],
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

const metricValues = {
  salesAmountRecorded: 12000,
  salesTransactions: 1,
  salesTransactionsWithAmount: 1,
  averageTransactionValue: 12000,
  invoicesCreated: 1,
  expensesRecorded: 0,
  debtCollectionsRecorded: 0,
  debtCollectionsAmount: 0,
  supplierSettlementsRecorded: 0,
  supplierSettlementsAmount: 0,
  stockInOperations: 1,
  stockOutOperations: 0,
  warehouseTransferActions: 0,
  reversalsCorrections: 0,
  activeDays: 1,
  lastRecordedActivity: "2026-07-05T10:00:00.000Z",
  salesContributionPercent: 100,
};

const summaryPayload = {
  formulaVersion: "staff-performance-v1",
  business: { id: "biz_1", name: "Preview Shop", currency: "NGN" },
  location: { id: null, name: "All locations" },
  period: {
    preset: "this_month",
    label: "This month",
    start: "2026-07-01T00:00:00.000Z",
    end: "2026-08-01T00:00:00.000Z",
  },
  comparisonPeriod: {
    start: "2026-06-01T00:00:00.000Z",
    end: "2026-07-01T00:00:00.000Z",
  },
  generatedAt: "2026-07-23T10:00:00.000Z",
  rows: [
    {
      staff: { userId: "staff_1", name: "Tunde", role: "STAFF" },
      metrics: metricValues,
      comparison: { salesAmountRecorded: 8000, salesTransactions: 1, activeDays: 1 },
      dataQualityNotes: [],
    },
  ],
  totals: metricValues,
  summaryCards: {
    attributedSalesAmount: 12000,
    salesTransactions: 1,
    averageTransactionValue: 12000,
    activeStaff: 1,
    unattributedRecords: 0,
  },
  unattributedRecords: {
    salesTransactions: 0,
    salesAmountRecords: 0,
    expenses: 0,
    invoices: 0,
    debtCollections: 0,
    supplierSettlements: 0,
    stockInOperations: 0,
    stockOutOperations: 0,
    warehouseTransferActions: 0,
    reversalsCorrections: 0,
    locationUnscopedRecords: 0,
  },
  dataQualityNotes: [],
  metricDefinitions: {},
  disclaimer: "Operational activity indicator — not an employment decision.",
};
