import { expect, test, type Page, type Route } from "@playwright/test";

const flagsEnabled = [
  "NEXT_PUBLIC_PHASE3_COOPERATIVES_ENABLED",
  "PHASE3_COOPERATIVES_ENABLED",
].every((key) => ["1", "true", "yes", "on"].includes(String(process.env[key] ?? "").toLowerCase()));

test.describe("Cooperatives Preview workflow", () => {
  test.skip(!flagsEnabled, "Cooperatives Preview flags are not enabled for this test run.");

  test.beforeEach(async ({ page }) => {
    await mockDashboard(page);
    await page.route("**/api/billing/status", async (route) => {
      await json(route, 200, { billingLive: true, provider: "paystack" });
    });
  });

  test("creates profile, member, contribution, loan, repayment, statement, and export", async ({ page }) => {
    const unexpectedFailures: string[] = [];
    const state = createCooperativesRouteState();
    await installCooperativesRoutes(page, state);

    page.on("response", (response) => {
      if (
        (response.url().includes("/more/cooperatives") || response.url().includes("/api/cooperatives")) &&
        [404, 500].includes(response.status())
      ) {
        unexpectedFailures.push(`${response.status()} ${response.url()}`);
      }
    });

    const moreResponse = await page.goto("/more");
    expect(moreResponse?.status()).not.toBe(404);
    expect(moreResponse?.status()).toBeLessThan(500);
    await expect(page.locator('a[href="/more/cooperatives"]')).toContainText("Preview");
    await page.locator('a[href="/more/cooperatives"]').click();

    await expect(page.getByRole("heading", { name: "Savings groups and member ledgers" })).toBeVisible();
    await expect(page.getByText("Internal cooperative bookkeeping only.")).toBeVisible();
    await expect(page.getByText("No cooperative records yet.")).toBeVisible();

    await page.getByLabel("Cooperative name").fill("Market Traders Coop");
    await page.getByLabel("Default contribution").fill("5000");
    await page.getByRole("button", { name: "Create" }).click();
    await expect.poll(() => state.groupCreated).toBe(true);
    await expect(page.getByRole("heading", { name: "Market Traders Coop" })).toBeVisible();

    await page.getByRole("tab", { name: "Members" }).click();
    await page.getByLabel("Member no.").fill("M-001");
    await page.getByLabel("Member name").fill("Ada Member");
    await page.getByLabel("Phone").fill("08031234567");
    await page.getByRole("button", { name: "Add" }).click();
    await expect.poll(() => state.memberCreated).toBe(true);
    await expect(page.getByText("Ada Member")).toBeVisible();

    await page.getByRole("button", { name: "Statement" }).click();
    await expect(page.getByText(/Outstanding/)).toBeVisible();

    await page.getByRole("tab", { name: "Contributions" }).click();
    await page.getByLabel("Reference").fill("CONT-001");
    await page.getByRole("button", { name: "Record", exact: true }).click();
    await expect.poll(() => state.contributionRecorded).toBe(true);
    const recentContributions = page.getByRole("heading", { name: "Recent contributions" }).locator("xpath=ancestor::div[1]");
    await expect(recentContributions.getByText("Ada Member")).toBeVisible();
    await expect(recentContributions.getByText(/5,000/)).toBeVisible();

    await page.getByRole("tab", { name: "Loans" }).click();
    await page.getByLabel("Principal").fill("20000");
    await page.getByRole("button", { name: "Loan" }).click();
    await expect.poll(() => state.loanRequested).toBe(true);
    await expect(page.getByText("draft")).toBeVisible();

    await page.getByRole("button", { name: "Submit" }).click();
    await expect.poll(() => state.loanSubmitted).toBe(true);
    await page.getByRole("button", { name: "Approve" }).click();
    await expect.poll(() => state.loanApproved).toBe(true);
    await page.getByRole("button", { name: "Disburse" }).click();
    await expect.poll(() => state.loanDisbursed).toBe(true);
    await page.getByLabel("Repayment").fill("5000");
    await page.getByRole("button", { name: "Record", exact: true }).click();
    await expect.poll(() => state.repaymentRecorded).toBe(true);

    await page.getByRole("tab", { name: "Reports" }).click();
    await expect(page.getByText("Schedules")).toBeVisible();

    await page.getByRole("button", { name: "Export" }).click();
    await expect.poll(() => state.exportRequested).toBe(true);

    const checks = await page.evaluate(async () => {
      const isolation = await fetch("/api/cooperatives?businessId=other_biz");
      const statuses = await Promise.all([
        fetch("/api/cooperatives?businessId=biz_1", { method: "PUT" }),
        fetch("/api/cooperatives/group_1/contributions?businessId=biz_1", { method: "DELETE" }),
        fetch("/api/cooperatives/group_1/loans/loan_1/repayments?businessId=biz_1", { method: "GET" }),
        fetch("/api/cooperatives/group_1/export?businessId=biz_1", { method: "POST" }),
      ]);

      return {
        isolationStatus: isolation.status,
        methodStatuses: statuses.map((response) => response.status),
      };
    });

    expect(checks.isolationStatus).toBe(403);
    expect(checks.methodStatuses).toEqual([405, 405, 405, 405]);
    expect(unexpectedFailures).toEqual([]);
  });

  test("handles empty, unauthorized, and API flag-off states", async ({ page }) => {
    const state = createCooperativesRouteState();
    await installCooperativesRoutes(page, state);

    await page.goto("/more/cooperatives");
    await expect(page.getByText("No cooperative records yet.")).toBeVisible();

    state.forceUnauthorized = true;
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByText("You do not have permission to view Cooperatives.")).toBeVisible();

    state.forceUnauthorized = false;
    state.forceDisabled = true;
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByText("Cooperatives are unavailable in this environment.")).toBeVisible();
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
          canViewLocations: true,
          canManageLocations: true,
          canViewTransfers: true,
          canManageTransfers: true,
          canApproveTransfers: true,
          canReceiveTransfers: true,
          canManageTax: true,
        },
        billing: {
          planId: "pro",
          planName: "Pro",
          features: ["cooperatives", "advanced_reports", "granular_permissions", "audit_tools"],
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

type CooperativesRouteState = {
  groups: CooperativeGroupPayload[];
  groupCreated: boolean;
  memberCreated: boolean;
  contributionRecorded: boolean;
  loanRequested: boolean;
  loanSubmitted: boolean;
  loanApproved: boolean;
  loanDisbursed: boolean;
  repaymentRecorded: boolean;
  exportRequested: boolean;
  forceUnauthorized: boolean;
  forceDisabled: boolean;
};

function createCooperativesRouteState(): CooperativesRouteState {
  return {
    groups: [],
    groupCreated: false,
    memberCreated: false,
    contributionRecorded: false,
    loanRequested: false,
    loanSubmitted: false,
    loanApproved: false,
    loanDisbursed: false,
    repaymentRecorded: false,
    exportRequested: false,
    forceUnauthorized: false,
    forceDisabled: false,
  };
}

async function installCooperativesRoutes(page: Page, state: CooperativesRouteState) {
  await page.route("**/api/cooperatives**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const body = readJson(request.postData());
    const businessId = url.searchParams.get("businessId") ?? String(body.businessId ?? "");

    if (unsupported(url.pathname, method)) {
      await methodNotAllowed(route, allowForPath(url.pathname));
      return;
    }

    if (state.forceDisabled) {
      await json(route, 503, { error: "Cooperatives are unavailable in this environment." });
      return;
    }

    if (state.forceUnauthorized) {
      await json(route, 403, { error: "You do not have permission to view Cooperatives." });
      return;
    }

    if (businessId && businessId !== "biz_1") {
      await json(route, 403, { error: "You do not have access to this business." });
      return;
    }

    if (url.pathname === "/api/cooperatives" && method === "GET") {
      await json(route, 200, { groups: state.groups, capabilities });
      return;
    }

    if (url.pathname === "/api/cooperatives" && method === "POST" && body.action === "create_group") {
      state.groupCreated = true;
      state.groups = [groupPayload(String(body.name ?? "Market Traders Coop"))];
      await json(route, 200, { result: state.groups[0], capabilities });
      return;
    }

    if (url.pathname === "/api/cooperatives/group_1/members" && method === "POST") {
      state.memberCreated = true;
      state.groups = [
        {
          ...group(),
          members: [
            {
              id: "member_1",
              memberNumber: String(body.memberNumber ?? "M-001"),
              displayName: String(body.displayName ?? "Ada Member"),
              fullName: null,
              phone: String(body.phone ?? "08031234567"),
              email: null,
              status: "ACTIVE",
              joinedAt: "2026-08-03T00:00:00.000Z",
              balance: 0,
            },
          ],
        },
      ];
      await json(route, 200, { member: state.groups[0].members[0], capabilities });
      return;
    }

    if (url.pathname === "/api/cooperatives/group_1/contribution-plans" && method === "POST") {
      state.groups = [
        {
          ...group(),
          contributionPlans: [
            ...group().contributionPlans,
            {
              id: "plan_2",
              name: String(body.name ?? "Monthly savings"),
              amount: Number(body.amount ?? 5000),
              frequency: String(body.frequency ?? "MONTHLY"),
              startDate: "2026-08-03T00:00:00.000Z",
              endDate: null,
              graceDays: 0,
              penaltyAmount: 0,
              mandatory: true,
              active: true,
              status: "ACTIVE",
            },
          ],
        },
      ];
      await json(route, 200, { contributionPlan: state.groups[0].contributionPlans.at(-1), capabilities });
      return;
    }

    if (url.pathname === "/api/cooperatives/group_1/contributions" && method === "POST") {
      state.contributionRecorded = true;
      const contribution = {
        id: "contribution_1",
        memberId: "member_1",
        planId: "plan_1",
        amount: Number(body.amount ?? 5000),
        penaltyAmount: 0,
        paidAt: "2026-08-03T00:00:00.000Z",
        dueDate: null,
        status: "RECORDED",
        reference: String(body.reference ?? "CONT-001"),
      };
      state.groups = [
        {
          ...group(),
          members: [{ ...group().members[0], balance: contribution.amount }],
          contributions: [contribution],
          summary: {
            ...group().summary,
            contributionTotal: contribution.amount,
            groupCashBalance: contribution.amount,
            memberBalances: [{ memberId: "member_1", displayName: "Ada Member", balance: contribution.amount }],
          },
        },
      ];
      await json(route, 200, { contribution, capabilities });
      return;
    }

    if (url.pathname === "/api/cooperatives/group_1/loans" && method === "POST") {
      state.loanRequested = true;
      state.groups = [
        {
          ...group(),
          loans: [loanPayload("draft")],
        },
      ];
      await json(route, 200, { loan: state.groups[0].loans[0], capabilities });
      return;
    }

    if (url.pathname === "/api/cooperatives/group_1/loans/loan_1/submit" && method === "POST") {
      state.loanSubmitted = true;
      state.groups = [{ ...group(), loans: [loanPayload("committee_review")] }];
      await json(route, 200, { loan: state.groups[0].loans[0], capabilities });
      return;
    }

    if (url.pathname === "/api/cooperatives/group_1/loans/loan_1/approve" && method === "POST") {
      state.loanApproved = true;
      state.groups = [{ ...group(), loans: [loanPayload("approved")] }];
      await json(route, 200, { loan: state.groups[0].loans[0], capabilities });
      return;
    }

    if (url.pathname === "/api/cooperatives/group_1/loans/loan_1/record-disbursement" && method === "POST") {
      state.loanDisbursed = true;
      state.groups = [
        {
          ...group(),
          loans: [loanPayload("active")],
          repaymentSchedules: [
            {
              id: "schedule_1",
              loanId: "loan_1",
              instalmentNumber: 1,
              dueDate: "2026-09-03T00:00:00.000Z",
              totalDue: 20000,
              paidAmount: 0,
              status: "PENDING",
            },
          ],
          summary: { ...group().summary, loanDisbursementTotal: 20000, groupCashBalance: -15000 },
        },
      ];
      await json(route, 200, { loan: state.groups[0].loans[0], capabilities });
      return;
    }

    if (url.pathname === "/api/cooperatives/group_1/loans/loan_1/repayments" && method === "POST") {
      state.repaymentRecorded = true;
      state.groups = [
        {
          ...group(),
          loans: [{ ...loanPayload("active"), outstandingAmount: 15000 }],
          repaymentSchedules: [
            {
              id: "schedule_1",
              loanId: "loan_1",
              instalmentNumber: 1,
              dueDate: "2026-09-03T00:00:00.000Z",
              totalDue: 20000,
              paidAmount: 5000,
              status: "PARTIAL",
            },
          ],
          summary: { ...group().summary, repaymentTotal: 5000, groupCashBalance: -10000 },
        },
      ];
      await json(route, 200, { repayment: { id: "repayment_1" }, capabilities });
      return;
    }

    if (url.pathname === "/api/cooperatives/group_1/members/member_1/statement" && method === "GET") {
      await json(route, 200, {
        statement: {
          totals: { savingsBalance: group().members[0]?.balance ?? 0, outstandingLoans: group().loans[0]?.outstandingAmount ?? 0 },
          movements: [],
        },
        capabilities,
      });
      return;
    }

    if (url.pathname === "/api/cooperatives/group_1/export" && method === "GET") {
      state.exportRequested = true;
      await route.fulfill({
        status: 200,
        contentType: "text/csv",
        headers: { "Content-Disposition": 'attachment; filename="cooperative-group_1.csv"' },
        body: "group,members,cash_balance\nMarket Traders Coop,1,5000\n",
      });
      return;
    }

    await json(route, 404, { error: "Not found" });
  });

  function group() {
    return state.groups[0] ?? groupPayload("Market Traders Coop");
  }
}

const capabilities = {
  canRead: true,
  canManage: true,
  canManageMembers: true,
  canRecordContributions: true,
  canReviewLoans: true,
  canApproveLoans: true,
  canRecordDisbursement: true,
  canRecordRepayment: true,
  canExport: true,
  canViewMemberSensitive: true,
};

function groupPayload(name: string): CooperativeGroupPayload {
  return {
    id: "group_1",
    businessId: "biz_1",
    locationId: "loc_main",
    name,
    description: null,
    registrationReference: null,
    currency: "NGN",
    status: "ACTIVE",
    contributionCycle: "MONTHLY",
    loanApprovalMode: "committee",
    dividendRule: "proportional_contributions",
    fiscalYearStart: 1,
    requireGuarantors: false,
    minimumGuarantors: 0,
    memberCount: 0,
    activeLoanCount: 0,
    createdAt: "2026-08-03T00:00:00.000Z",
    members: [],
    contributionPlans: [
      {
        id: "plan_1",
        name: "Member contribution",
        amount: 5000,
        frequency: "MONTHLY",
        startDate: "2026-08-03T00:00:00.000Z",
        endDate: null,
        graceDays: 0,
        penaltyAmount: 0,
        mandatory: true,
        active: true,
        status: "ACTIVE",
      },
    ],
    contributions: [],
    loans: [],
    repaymentSchedules: [],
    summary: {
      formulaVersion: "cooperative-ledger-v2-balanced-batches",
      generatedAt: "2026-08-03T00:00:00.000Z",
      groupCashBalance: 0,
      contributionTotal: 0,
      loanDisbursementTotal: 0,
      repaymentTotal: 0,
      expenseTotal: 0,
      distributionTotal: 0,
      memberBalances: [],
      loanBalances: [],
      arrears: [],
      validation: { valid: true, violations: [] },
      warnings: [],
      sourceMetrics: {
        memberCount: 0,
        contributionCount: 0,
        loanCount: 0,
        repaymentCount: 0,
        ledgerEntryCount: 0,
      },
    },
  };
}

function loanPayload(status: string): CooperativeLoanPayload {
  return {
    id: "loan_1",
    memberId: "member_1",
    principal: 20000,
    approvedAmount: status === "draft" ? null : 20000,
    interestAmount: 0,
    interestRate: 0,
    interestMethod: "zero",
    termCount: 1,
    repaymentFrequency: "MONTHLY",
    totalDue: 20000,
    disbursedAmount: status === "active" ? 20000 : 0,
    status,
    purpose: null,
    requestedAt: "2026-08-03T00:00:00.000Z",
    approvedAt: status === "approved" || status === "active" ? "2026-08-03T00:00:00.000Z" : null,
    disbursedAt: status === "active" ? "2026-08-03T00:00:00.000Z" : null,
    dueAt: null,
    outstandingAmount: 20000,
  };
}

function unsupported(pathname: string, method: string) {
  if (pathname === "/api/cooperatives") {
    return !["GET", "POST"].includes(method);
  }

  if (pathname.endsWith("/export") || pathname.endsWith("/statement")) {
    return method !== "GET";
  }

  if (pathname.includes("/submit") || pathname.includes("/approve") || pathname.includes("/record-disbursement") || pathname.includes("/repayments")) {
    return method !== "POST";
  }

  if (pathname.endsWith("/members") || pathname.endsWith("/contribution-plans") || pathname.endsWith("/contributions") || pathname.endsWith("/loans")) {
    return !["GET", "POST"].includes(method);
  }

  return false;
}

function allowForPath(pathname: string) {
  if (pathname === "/api/cooperatives") {
    return "GET, POST";
  }

  if (pathname.endsWith("/export") || pathname.endsWith("/statement")) {
    return "GET";
  }

  if (pathname.includes("/submit") || pathname.includes("/approve") || pathname.includes("/record-disbursement") || pathname.includes("/repayments")) {
    return "POST";
  }

  return "GET, POST";
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

function readJson(raw: string | null) {
  if (!raw) {
    return {} as Record<string, unknown>;
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

type CooperativeGroupPayload = {
  id: string;
  businessId: string;
  locationId: string | null;
  name: string;
  description: string | null;
  registrationReference: string | null;
  currency: string;
  status: string;
  contributionCycle: string;
  loanApprovalMode: string;
  dividendRule: string;
  fiscalYearStart: number;
  requireGuarantors: boolean;
  minimumGuarantors: number;
  memberCount: number;
  activeLoanCount: number;
  createdAt: string;
  members: Array<{
    id: string;
    memberNumber: string | null;
    displayName: string;
    fullName: string | null;
    phone: string | null;
    email: string | null;
    status: string;
    joinedAt: string;
    balance: number;
  }>;
  contributionPlans: Array<{
    id: string;
    name: string;
    amount: number;
    frequency: string;
    startDate: string;
    endDate: string | null;
    graceDays: number;
    penaltyAmount: number;
    mandatory: boolean;
    active: boolean;
    status: string;
  }>;
  contributions: Array<{
    id: string;
    memberId: string;
    planId: string | null;
    amount: number;
    penaltyAmount: number;
    paidAt: string;
    dueDate: string | null;
    status: string;
    reference: string | null;
  }>;
  loans: CooperativeLoanPayload[];
  repaymentSchedules: Array<{
    id: string;
    loanId: string;
    instalmentNumber: number;
    dueDate: string;
    totalDue: number;
    paidAmount: number;
    status: string;
  }>;
  summary: {
    formulaVersion: string;
    generatedAt: string;
    groupCashBalance: number;
    contributionTotal: number;
    loanDisbursementTotal: number;
    repaymentTotal: number;
    expenseTotal: number;
    distributionTotal: number;
    memberBalances: Array<{ memberId: string; displayName?: string; balance: number }>;
    loanBalances: Array<{ loanId: string; memberId: string; totalDue: number; repaidAmount: number; outstandingAmount: number; overdue: boolean }>;
    arrears: Array<{ memberId: string; planId: string; expectedAmount: number; paidAmount: number; arrearsAmount: number; penaltyAccrued: number; periodsDue: number }>;
    validation: { valid: boolean; violations: string[] };
    warnings: string[];
    sourceMetrics: {
      memberCount: number;
      contributionCount: number;
      loanCount: number;
      repaymentCount: number;
      ledgerEntryCount: number;
    };
  };
};

type CooperativeLoanPayload = {
  id: string;
  memberId: string;
  principal: number;
  approvedAmount: number | null;
  interestAmount: number;
  interestRate: number;
  interestMethod: string;
  termCount: number;
  repaymentFrequency: string;
  totalDue: number;
  disbursedAmount: number;
  status: string;
  purpose: string | null;
  requestedAt: string;
  approvedAt: string | null;
  disbursedAt: string | null;
  dueAt: string | null;
  outstandingAmount: number;
};
