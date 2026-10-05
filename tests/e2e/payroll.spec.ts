import { expect, test, type Page, type Route } from "@playwright/test";

const flagsEnabled = [
  "NEXT_PUBLIC_PHASE3_PAYROLL_ENABLED",
  "PHASE3_PAYROLL_ENABLED",
].every((key) => ["1", "true", "yes", "on"].includes(String(process.env[key] ?? "").toLowerCase()));

test.describe("Payroll Preview workflow", () => {
  test.skip(!flagsEnabled, "Payroll Preview flags are not enabled for this test run.");

  test.beforeEach(async ({ page }) => {
    await mockDashboard(page);
    await page.route("**/api/billing/status", async (route) => {
      await json(route, 200, { billingLive: true, provider: "paystack" });
    });
  });

  test("creates employee, calculates payroll, approves, posts expense, exports, and blocks duplicates", async ({ page }) => {
    const unexpectedFailures: string[] = [];
    const state = createPayrollRouteState();
    await installPayrollRoutes(page, state);

    page.on("response", (response) => {
      if (
        (response.url().includes("/more/payroll") || response.url().includes("/api/payroll")) &&
        [404, 500].includes(response.status())
      ) {
        unexpectedFailures.push(`${response.status()} ${response.url()}`);
      }
    });

    const moreResponse = await page.goto("/more");
    expect(moreResponse?.status()).not.toBe(404);
    expect(moreResponse?.status()).toBeLessThan(500);
    await expect(page.locator('a[href="/more/payroll"]')).toContainText("Preview");
    await page.locator('a[href="/more/payroll"]').click();

    await expect(page.getByRole("heading", { name: "Controlled payroll workflow" })).toBeVisible();
    await expect(page.getByText("Setup-required statutory notice")).toBeVisible();
    await expect(page.getByText("No payroll employees have been created.")).toBeVisible();

    await page.getByLabel("Employee name").fill("Ada Payroll");
    await page.getByLabel("Employee number").fill("EMP-001");
    await page.getByLabel("Job title").fill("Shop supervisor");
    await page.getByLabel("Base salary").fill("100000");
    await page.getByLabel("Allowance").fill("10000");
    await page.getByLabel("Deduction").fill("3000");
    await page.getByLabel("Bank account").fill("1234567890");
    await page.getByRole("button", { name: "Create employee" }).click();
    await expect.poll(() => state.employeeCreated).toBe(true);
    await expect(page.getByText(/Ada Payroll/)).toBeVisible();
    await expect(page.getByText(/7890/)).toBeVisible();

    await page.getByLabel("Start date").fill("2026-07-01");
    await page.getByLabel("End date").fill("2026-08-01");
    await page.getByLabel("Pay date").fill("2026-07-31");
    await page.getByRole("button", { name: "Create period" }).click();
    await expect.poll(() => state.periodCreated).toBe(true);

    await page.getByRole("button", { name: "Calculate" }).click();
    await expect.poll(() => state.calculated).toBe(true);
    await expect(page.getByText(/EMP-001.*gross.*net/)).toBeVisible();

    await page.getByRole("button", { name: "Submit review" }).click();
    await expect.poll(() => state.submitted).toBe(true);
    await page.getByRole("button", { name: "Approve" }).click();
    await expect.poll(() => state.approved).toBe(true);

    await page.getByRole("button", { name: "Generate payslips" }).click();
    await expect.poll(() => state.payslipsGenerated).toBe(true);
    await expect(page.getByText("Payslip ready")).toBeVisible();

    await page.getByRole("button", { name: "Post expense" }).click();
    await expect.poll(() => state.postCount).toBe(1);
    await expect(page.getByRole("main").getByText("Payroll expense posted.")).toBeVisible();
    await page.getByRole("button", { name: "Post expense" }).click();
    await expect.poll(() => state.postCount).toBe(2);
    await expect(page.getByRole("main").getByText("Payroll expense was already posted.")).toBeVisible();

    await page.getByRole("link", { name: "Export" }).click();
    await expect.poll(() => state.exportRequested).toBe(true);

    const checks = await page.evaluate(async () => {
      const isolation = await fetch("/api/payroll?businessId=other_biz");
      const statuses = await Promise.all([
        fetch("/api/payroll/employees?businessId=biz_1", { method: "DELETE" }),
        fetch("/api/payroll/periods/period_1/calculate?businessId=biz_1", { method: "DELETE" }),
        fetch("/api/payroll/export?businessId=biz_1", { method: "POST" }),
      ]);

      return {
        isolationStatus: isolation.status,
        methodStatuses: statuses.map((response) => response.status),
      };
    });

    expect(checks.isolationStatus).toBe(403);
    expect(checks.methodStatuses).toEqual([405, 405, 405]);
    expect(unexpectedFailures).toEqual([]);
  });

  test("handles empty and unauthorized states", async ({ page }) => {
    const state = createPayrollRouteState();
    await installPayrollRoutes(page, state);

    await page.goto("/more/payroll");
    await expect(page.getByText("No payroll employees have been created.")).toBeVisible();
    await expect(page.getByText("Empty state: calculate a payroll period after creating active employees.")).toBeVisible();

    state.forceUnauthorized = true;
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByText("You do not have permission to view Payroll.")).toBeVisible();
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
          canViewPayroll: true,
          canManagePayrollEmployees: true,
          canPreparePayroll: true,
          canReviewPayroll: true,
          canApprovePayroll: true,
          canExportPayroll: true,
          canPostPayrollExpense: true,
          canViewPayrollSensitive: true,
        },
        billing: {
          planId: "pro",
          planName: "Pro",
          features: ["payroll", "advanced_reports", "granular_permissions", "audit_tools"],
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

type PayrollRouteState = {
  employees: EmployeePayload[];
  periods: PeriodPayload[];
  employeeCreated: boolean;
  periodCreated: boolean;
  calculated: boolean;
  submitted: boolean;
  approved: boolean;
  payslipsGenerated: boolean;
  postCount: number;
  exportRequested: boolean;
  forceUnauthorized: boolean;
};

function createPayrollRouteState(): PayrollRouteState {
  return {
    employees: [],
    periods: [],
    employeeCreated: false,
    periodCreated: false,
    calculated: false,
    submitted: false,
    approved: false,
    payslipsGenerated: false,
    postCount: 0,
    exportRequested: false,
    forceUnauthorized: false,
  };
}

async function installPayrollRoutes(page: Page, state: PayrollRouteState) {
  await page.route("**/api/payroll**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const body = readJson(request.postData());
    const businessId = url.searchParams.get("businessId") ?? String(body.businessId ?? "");

    if (unsupported(url.pathname, method)) {
      await methodNotAllowed(route, allowForPath(url.pathname));
      return;
    }

    if (state.forceUnauthorized) {
      await json(route, 403, { error: "You do not have permission to view Payroll." });
      return;
    }

    if (businessId && businessId !== "biz_1") {
      await json(route, 403, { error: "You do not have access to this business." });
      return;
    }

    if (url.pathname === "/api/payroll" && method === "GET") {
      await json(route, 200, { dashboard: dashboard(state), setup, capabilities });
      return;
    }

    if (url.pathname === "/api/payroll/employees" && method === "POST") {
      state.employeeCreated = true;
      state.employees = [employeePayload(String(body.displayName ?? "Ada Payroll"))];
      await json(route, 201, { employee: state.employees[0], setup, capabilities });
      return;
    }

    if (url.pathname === "/api/payroll/periods" && method === "POST") {
      state.periodCreated = true;
      state.periods = [periodPayload("DRAFT")];
      await json(route, 201, { period: state.periods[0], setup, capabilities });
      return;
    }

    if (url.pathname === "/api/payroll/periods/period_1/calculate" && method === "POST") {
      state.calculated = true;
      state.periods = [periodPayload("CALCULATED")];
      await json(route, 200, { period: state.periods[0], capabilities });
      return;
    }

    if (url.pathname === "/api/payroll/periods/period_1/submit-review" && method === "POST") {
      state.submitted = true;
      state.periods = [periodPayload("UNDER_REVIEW")];
      await json(route, 200, { period: state.periods[0], capabilities });
      return;
    }

    if (url.pathname === "/api/payroll/periods/period_1/approve" && method === "POST") {
      state.approved = true;
      state.periods = [periodPayload("APPROVED")];
      await json(route, 200, { period: state.periods[0], capabilities });
      return;
    }

    if (url.pathname === "/api/payroll/periods/period_1/payslips" && method === "GET") {
      state.payslipsGenerated = true;
      state.periods = [{ ...periodPayload(state.periods[0]?.status ?? "APPROVED"), payslipCount: 1 }];
      await json(route, 200, { payslips: [{ id: "payslip_1" }], capabilities });
      return;
    }

    if (url.pathname === "/api/payroll/periods/period_1/post-expense" && method === "POST") {
      state.postCount += 1;
      state.periods = [periodPayload("EXPENSE_POSTED", state.postCount > 1)];
      await json(route, 200, {
        result: {
          period: state.periods[0],
          transaction: { id: "txn_1" },
          alreadyPosted: state.postCount > 1,
        },
        capabilities,
      });
      return;
    }

    if (url.pathname === "/api/payroll/export" && method === "GET") {
      state.exportRequested = true;
      await route.fulfill({
        status: 200,
        contentType: "text/csv",
        headers: { "Content-Disposition": 'attachment; filename="payroll-preview-report.csv"' },
        body: "Section,Name,Gross Pay\nPayroll Period,period_1,110000\n",
      });
      return;
    }

    await json(route, 404, { error: "Not found" });
  });
}

function dashboard(state: PayrollRouteState) {
  return {
    setup,
    employees: state.employees,
    periods: state.periods,
    runs: state.periods,
    componentDefinitions: [],
  };
}

const setup = {
  statutory: {
    status: "setup_required",
    version: "phase3i-statutory-rules-empty-v1",
    rules: [],
    message: "Statutory payroll setup required.",
  },
  calculationVersion: "phase3i-payroll-calculation-v1",
  snapshotVersion: "phase3i-payroll-snapshot-v1",
  payments: {
    enabled: false,
    status: "disabled",
    message: "Payroll does not transfer money or connect to bank payroll systems in this Preview release.",
  },
  expensePosting: {
    enabled: true,
    status: "explicit_only",
    message: "Approved payroll can be posted as an accounting expense only through an explicit authorized action.",
  },
};

const capabilities = {
  canRead: true,
  canManageEmployees: true,
  canPrepare: true,
  canReview: true,
  canApprove: true,
  canExport: true,
  canPostExpense: true,
  canViewSensitive: true,
};

function employeePayload(name: string): EmployeePayload {
  return {
    id: "employee_1",
    employeeNumber: "EMP-001",
    displayName: name,
    fullName: name,
    roleTitle: null,
    jobTitle: "Shop supervisor",
    email: null,
    phone: null,
    baseSalary: 100000,
    payFrequency: "MONTHLY",
    country: "NG",
    currency: "NGN",
    status: "ACTIVE",
    employmentStatus: "active",
    startDate: "2026-07-01T00:00:00.000Z",
    endDate: null,
    paymentMethod: "manual",
    maskedBankAccount: "****7890",
    pensionNumber: null,
    taxId: null,
    components: [{ label: "Transport allowance", amount: 10000, type: "allowance" }],
  };
}

function periodPayload(status: string, posted = false): PeriodPayload {
  return {
    id: "period_1",
    periodStart: "2026-07-01T00:00:00.000Z",
    periodEnd: "2026-08-01T00:00:00.000Z",
    payDate: "2026-07-31T00:00:00.000Z",
    ruleVersion: "phase3i-payroll-custom-inputs-v1",
    calculationVersion: "phase3i-payroll-calculation-v1",
    snapshotVersion: "phase3i-payroll-snapshot-v1",
    statutorySetupStatus: "setup_required",
    status,
    employeeCount: 1,
    grossPay: 110000,
    totalDeductions: 3000,
    netPay: 107000,
    preparedByUserId: "user_1",
    submittedForReviewAt: status === "UNDER_REVIEW" ? "2026-07-30T08:05:00.000Z" : null,
    reviewedByUserId: status === "UNDER_REVIEW" ? "user_1" : null,
    reviewedAt: status === "UNDER_REVIEW" ? "2026-07-30T08:05:00.000Z" : null,
    approvedById: ["APPROVED", "EXPENSE_POSTED"].includes(status) ? "user_1" : null,
    approvedAt: ["APPROVED", "EXPENSE_POSTED"].includes(status) ? "2026-07-30T08:10:00.000Z" : null,
    expenseTransactionId: posted ? "txn_1" : null,
    expensePostedAt: status === "EXPENSE_POSTED" ? "2026-07-30T08:12:00.000Z" : null,
    lockedAt: ["APPROVED", "EXPENSE_POSTED"].includes(status) ? "2026-07-30T08:10:00.000Z" : null,
    reversedAt: null,
    reversalReason: null,
    requiresDualApproval: false,
    warnings: ["Statutory payroll setup required."],
    payslipCount: status === "APPROVED" ? 1 : 0,
    items: status === "DRAFT" ? [] : [runItem(status === "APPROVED")],
    approvalActions: [{ id: "action_1", action: status.toLowerCase(), reason: null, performedByUserId: "user_1", createdAt: "2026-07-30T08:00:00.000Z" }],
  };
}

function runItem(payslipGenerated: boolean) {
  return {
    id: "item_1",
    employeeId: "employee_1",
    employeeName: "Ada Payroll",
    employeeNumber: "EMP-001",
    jobTitle: "Shop supervisor",
    basePay: 100000,
    allowances: [],
    bonuses: [],
    deductions: [],
    loansAndAdvances: [],
    componentSnapshot: [],
    grossPay: 110000,
    taxablePay: 110000,
    totalDeductions: 3000,
    pensionEmployeeAmount: 0,
    pensionEmployerAmount: 0,
    taxAmount: 0,
    netPay: 107000,
    status: "approved",
    paymentStatus: "UNPAID",
    payslipGenerated,
  };
}

function unsupported(pathname: string, method: string) {
  const allowed = allowForPath(pathname).split(", ");
  return !allowed.includes(method);
}

function allowForPath(pathname: string) {
  if (pathname === "/api/payroll" || pathname === "/api/payroll/employees" || pathname === "/api/payroll/periods") {
    return "GET, POST";
  }

  if (pathname.endsWith("/payslips") || pathname === "/api/payroll/export") {
    return "GET";
  }

  return "POST";
}

async function methodNotAllowed(route: Route, allow: string) {
  await json(route, 405, { error: "Method not allowed." }, { Allow: allow });
}

async function json(route: Route, status: number, body: unknown, headers: Record<string, string> = {}) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers,
    body: JSON.stringify(body),
  });
}

function readJson(data: string | null) {
  if (!data) {
    return {};
  }

  try {
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    return {};
  }
}

type EmployeePayload = {
  id: string;
  employeeNumber: string;
  displayName: string;
  fullName: string;
  roleTitle: string | null;
  jobTitle: string;
  email: string | null;
  phone: string | null;
  baseSalary: number;
  payFrequency: string;
  country: string;
  currency: string;
  status: string;
  employmentStatus: string;
  startDate: string;
  endDate: string | null;
  paymentMethod: string;
  maskedBankAccount: string;
  pensionNumber: string | null;
  taxId: string | null;
  components: Array<Record<string, unknown>>;
};

type PeriodPayload = {
  id: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  ruleVersion: string;
  calculationVersion: string;
  snapshotVersion: string;
  statutorySetupStatus: string;
  status: string;
  employeeCount: number;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  preparedByUserId: string;
  submittedForReviewAt: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  approvedById: string | null;
  approvedAt: string | null;
  expenseTransactionId: string | null;
  expensePostedAt: string | null;
  lockedAt: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
  requiresDualApproval: boolean;
  warnings: string[];
  payslipCount: number;
  items: ReturnType<typeof runItem>[];
  approvalActions: Array<Record<string, unknown>>;
};
