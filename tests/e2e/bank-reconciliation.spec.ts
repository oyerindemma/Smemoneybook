import { expect, test } from "@playwright/test";

const flagsEnabled = [
  "NEXT_PUBLIC_PHASE3_BANK_RECONCILIATION_ENABLED",
  "PHASE3_BANK_RECONCILIATION_ENABLED",
].every((key) => ["1", "true", "yes", "on"].includes(String(process.env[key] ?? "").toLowerCase()));

test.describe("Bank Reconciliation Preview workflow", () => {
  test.skip(!flagsEnabled, "Bank Reconciliation Preview flags are not enabled for this test run.");

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

  test("imports, filters, reviews, exports, and handles empty/denied states", async ({ page }) => {
    let exportRequested = false;
    let importRequested = false;
    const entries = createEntries();

    await page.route("**/api/bank-reconciliation/imports/preview", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ preview: previewPayload }),
      });
    });
    await page.route("**/api/bank-reconciliation/imports?**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ imports: importsPayload }),
        });
        return;
      }

      importRequested = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          importId: "import_1",
          rowCount: 4,
          duplicateRowCount: 1,
          suggestedMatchCount: 1,
          warnings: [],
          message: "Bank statement imported for review.",
        }),
      });
    });
    await page.route("**/api/bank-reconciliation/imports", async (route) => {
      importRequested = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          importId: "import_1",
          rowCount: 4,
          duplicateRowCount: 1,
          suggestedMatchCount: 1,
          warnings: [],
          message: "Bank statement imported for review.",
        }),
      });
    });
    await page.route("**/api/bank-reconciliation/entries?**", async (route) => {
      const url = new URL(route.request().url());
      const status = url.searchParams.get("status") ?? "SUGGESTED";
      const query = url.searchParams.get("query")?.toLowerCase() ?? "";
      const from = url.searchParams.get("from");
      const filtered = entries.filter((entry) => {
        const matchesStatus = entry.status === status;
        const matchesQuery = !query || entry.description.toLowerCase().includes(query);
        const matchesDate = !from || entry.postedAt.startsWith(from);
        return matchesStatus && matchesQuery && matchesDate;
      });

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ entries: filtered, summary: summarize(entries) }),
      });
    });
    await page.route("**/api/bank-reconciliation/matches/match_1/confirm", async (route) => {
      entries[0].status = "MATCHED";
      entries[0].matches[0].status = "CONFIRMED";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Bank reconciliation match confirmed." }),
      });
    });
    await page.route("**/api/bank-reconciliation/matches/match_1/unmatch", async (route) => {
      entries[0].status = "UNMATCHED";
      entries[0].matches[0].status = "UNMATCHED";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Bank reconciliation match removed." }),
      });
    });
    await page.route("**/api/bank-reconciliation/entries/entry_2/ignore", async (route) => {
      entries[1].status = "IGNORED";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Bank statement entry ignored." }),
      });
    });
    await page.route("**/api/bank-reconciliation/entries/entry_2/reopen", async (route) => {
      entries[1].status = "UNMATCHED";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Bank statement entry reopened." }),
      });
    });
    await page.route("**/api/bank-reconciliation/export?**", async (route) => {
      exportRequested = true;
      await route.fulfill({
        status: 200,
        contentType: "text/csv",
        headers: { "Content-Disposition": 'attachment; filename="bank-reconciliation.csv"' },
        body: "entry_id,status\nentry_1,MATCHED\n",
      });
    });

    await page.goto("/more");
    await expect(page.locator('a[href="/more/bank-reconciliation"]')).toContainText("Preview");
    await page.locator('a[href="/more/bank-reconciliation"]').click();

    await expect(page.getByRole("heading", { name: "Review bank statement matches" })).toBeVisible();
    await expect(page.getByText("CSV review")).toBeVisible();

    const csv = [
      "Date,Description,Debit,Credit,Reference,Balance",
      "2026-07-19,Ada payment,,15000,REF-1,15000",
      "2026-07-20,Supplier payment,5000,,REF-2,10000",
    ].join("\n");
    await page.getByLabel("CSV file").setInputFiles({
      name: "statement.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
    await expect(page.getByText("Rows")).toBeVisible();
    await page.getByRole("button", { name: /^Import$/ }).click();
    await expect.poll(() => importRequested).toBe(true);

    await expect(page.getByRole("button", { name: /^Suggested queue/i })).toBeVisible();
    await expect(page.getByText("Ada payment").first()).toBeVisible();
    await page.getByLabel("From").fill("2026-07-19");
    await expect(page.getByText("Ada payment").first()).toBeVisible();
    await page.getByLabel("Search").fill("not-present");
    await expect(page.getByText("No suggested entries")).toBeVisible();
    await page.getByLabel("Search").fill("");

    await page.getByText("Ada payment").first().click();
    await page.getByRole("button", { name: /Confirm/i }).click();
    await expect(page.getByText("Bank reconciliation match confirmed.")).toBeVisible();

    await page.getByRole("button", { name: /^Matched queue/i }).click();
    await expect(page.getByText("Ada payment").first()).toBeVisible();
    await page.getByText("Ada payment").first().click();
    await page.getByRole("button", { name: "Unmatch", exact: true }).click();
    await expect(page.getByText("Bank reconciliation match removed.")).toBeVisible();

    await page.getByLabel("From").fill("");
    await page.getByRole("button", { name: /^Unmatched queue/i }).click();
    await expect(page.getByText("Supplier payment").first()).toBeVisible();
    await page.getByText("Supplier payment").first().click();
    await page.getByRole("button", { name: "Ignore", exact: true }).click();
    await expect(page.getByText("Bank statement entry ignored.")).toBeVisible();

    await page.getByRole("button", { name: /^Ignored queue/i }).click();
    await expect(page.getByText("Supplier payment").first()).toBeVisible();
    await page.getByText("Supplier payment").first().click();
    await page.getByRole("button", { name: /Reopen/i }).click();
    await expect(page.getByText("Bank statement entry reopened.")).toBeVisible();

    await page.getByRole("button", { name: /^Duplicates queue/i }).click();
    await expect(page.getByText("Duplicate POS settlement").first()).toBeVisible();

    await page.getByRole("button", { name: /Export reconciliation CSV/i }).click();
    await expect.poll(() => exportRequested).toBe(true);

    await page.unroute("**/api/bank-reconciliation/entries?**");
    await page.route("**/api/bank-reconciliation/entries?**", async (route) => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "You do not have permission to view Bank Reconciliation." }),
      });
    });
    await page.getByRole("button", { name: /Refresh reconciliation queue/i }).click();
    await expect(page.getByText("You do not have permission to view Bank Reconciliation.")).toBeVisible();
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
            canViewBankReconciliation: true,
            canImportBankReconciliation: true,
            canReviewBankReconciliation: true,
            canExportBankReconciliation: true,
          },
          billing: {
            planId: "growth",
            planName: "Growth",
            features: ["bank_reconciliation", "basic_exports"],
          },
          accounts: [{ id: "acct_1", name: "Main bank", type: "BANK", balance: 0 }],
          transactions: [],
          debts: [],
          items: [],
          auditLogs: [],
        },
      }),
    });
  });
}

const importsPayload = [
  {
    id: "import_1",
    fileName: "statement.csv",
    accountLabel: "Main bank",
    bankName: "Preview Bank",
    status: "IMPORTED",
    rowCount: 4,
    matchedCount: 0,
    duplicateRowCount: 1,
    statementStart: "2026-07-19T00:00:00.000Z",
    statementEnd: "2026-07-20T00:00:00.000Z",
    importedAt: "2026-07-23T10:00:00.000Z",
    lockedAt: null,
    version: 1,
    account: { id: "acct_1", name: "Main bank", type: "BANK" },
    location: { id: "loc_main", name: "Main shop" },
  },
];

const previewPayload = {
  headers: ["Date", "Description", "Debit", "Credit", "Reference", "Balance"],
  mapping: {
    postedAt: "Date",
    description: "Description",
    amount: "",
    debit: "Debit",
    credit: "Credit",
    reference: "Reference",
    balance: "Balance",
  },
  rowCount: 4,
  previewRows: [],
  errors: [],
  warnings: [],
  duplicateRowCount: 1,
  crossImportDuplicateCount: 0,
  totals: { inflow: 15000, outflow: 5000, net: 10000 },
};

function createEntries() {
  return [
    {
      id: "entry_1",
      rowNumber: 2,
      postedAt: "2026-07-19T00:00:00.000Z",
      amount: "15000",
      direction: "inflow",
      description: "Ada payment",
      reference: "REF-1",
      externalReference: null,
      balance: "15000",
      duplicateStatus: "UNIQUE",
      status: "SUGGESTED",
      suggestedCategory: "Bank transfer",
      statementImport: { id: "import_1", fileName: "statement.csv", bankName: "Preview Bank", accountLabel: "Main bank", importedAt: "2026-07-23T10:00:00.000Z", status: "IMPORTED" },
      matches: [
        {
          id: "match_1",
          status: "SUGGESTED",
          matchType: "exact",
          confidence: 95,
          transactionId: "txn_1",
          transaction: {
            id: "txn_1",
            type: "SALE",
            amount: "15000",
            description: "Ada payment",
            occurredAt: "2026-07-19T10:00:00.000Z",
          },
        },
      ],
    },
    {
      id: "entry_2",
      rowNumber: 3,
      postedAt: "2026-07-20T00:00:00.000Z",
      amount: "5000",
      direction: "outflow",
      description: "Supplier payment",
      reference: "REF-2",
      externalReference: null,
      balance: "10000",
      duplicateStatus: "UNIQUE",
      status: "UNMATCHED",
      suggestedCategory: "Supplier payment",
      statementImport: { id: "import_1", fileName: "statement.csv", bankName: "Preview Bank", accountLabel: "Main bank", importedAt: "2026-07-23T10:00:00.000Z", status: "IMPORTED" },
      matches: [],
    },
    {
      id: "entry_3",
      rowNumber: 4,
      postedAt: "2026-07-20T00:00:00.000Z",
      amount: "15000",
      direction: "inflow",
      description: "Duplicate POS settlement",
      reference: "REF-1",
      externalReference: null,
      balance: "25000",
      duplicateStatus: "PROBABLE_DUPLICATE",
      status: "DUPLICATE",
      suggestedCategory: "POS/Card settlement",
      statementImport: { id: "import_1", fileName: "statement.csv", bankName: "Preview Bank", accountLabel: "Main bank", importedAt: "2026-07-23T10:00:00.000Z", status: "IMPORTED" },
      matches: [],
    },
  ];
}

function summarize(entries: ReturnType<typeof createEntries>) {
  return {
    total: entries.length,
    suggested: entries.filter((entry) => entry.status === "SUGGESTED").length,
    unmatched: entries.filter((entry) => entry.status === "UNMATCHED").length,
    matched: entries.filter((entry) => entry.status === "MATCHED").length,
    ignored: entries.filter((entry) => entry.status === "IGNORED").length,
    duplicates: entries.filter((entry) => entry.status === "DUPLICATE").length,
    unresolved: entries.filter((entry) => ["SUGGESTED", "UNMATCHED", "DUPLICATE"].includes(entry.status)).length,
  };
}
