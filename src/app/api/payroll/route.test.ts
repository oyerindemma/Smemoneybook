import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockPayrollAccessError extends Error {
    status: number;
    code: string;

    constructor(message: string, status: number, code: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  return {
    AccessError: MockPayrollAccessError,
    requireUser: vi.fn(),
    enforceRateLimit: vi.fn(),
    requireAccess: vi.fn(),
    listDashboard: vi.fn(),
    createEmployee: vi.fn(),
    createPeriod: vi.fn(),
    calculatePeriod: vi.fn(),
    getPeriod: vi.fn(),
    submitReview: vi.fn(),
    approvePeriod: vi.fn(),
    postExpense: vi.fn(),
    reversePeriod: vi.fn(),
    generatePayslips: vi.fn(),
    serializeEmployee: vi.fn((employee) => employee),
    serializePeriod: vi.fn((period) => period),
    auditCreate: vi.fn(),
  };
});

vi.mock("@/lib/auth/session", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));

vi.mock("@/lib/payroll/authorization", () => ({
  PayrollAccessError: mocks.AccessError,
  requirePayrollAccess: mocks.requireAccess,
  isPayrollFeatureEnabledForServer: () => true,
}));

vi.mock("@/lib/payroll/service", () => ({
  listPayrollDashboard: mocks.listDashboard,
  createPayrollEmployee: mocks.createEmployee,
  createPayrollPeriod: mocks.createPeriod,
  calculatePayrollPeriod: mocks.calculatePeriod,
  getPayrollPeriod: mocks.getPeriod,
  submitPayrollForReview: mocks.submitReview,
  approvePayrollPeriod: mocks.approvePeriod,
  postPayrollExpense: mocks.postExpense,
  reversePayrollPeriod: mocks.reversePeriod,
  generatePayrollPayslips: mocks.generatePayslips,
  serializePayrollEmployee: mocks.serializeEmployee,
  serializePayrollPeriod: mocks.serializePeriod,
  getPayrollSetup: () => payrollDashboard.setup,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    auditLog: { create: mocks.auditCreate },
  }),
}));

const originalEnv = { ...process.env };

const access = {
  businessId: "biz_1",
  businessName: "Preview Shop",
  currency: "NGN",
  userId: "user_1",
  role: "OWNER",
  canRead: true,
  canManageEmployees: true,
  canPrepare: true,
  canReview: true,
  canApprove: true,
  canExport: true,
  canPostExpense: true,
  canViewSensitive: true,
};

const period = {
  id: "period_1",
  status: "CALCULATED",
  periodStart: "2026-07-01T00:00:00.000Z",
  periodEnd: "2026-08-01T00:00:00.000Z",
  payDate: "2026-07-31T00:00:00.000Z",
  ruleVersion: "phase3i-payroll-custom-inputs-v1",
  calculationVersion: "phase3i-payroll-calculation-v1",
  snapshotVersion: "phase3i-payroll-snapshot-v1",
  statutorySetupStatus: "setup_required",
  grossPay: 110000,
  totalDeductions: 3000,
  netPay: 107000,
  employeeCount: 1,
  requiresDualApproval: false,
};

const payrollDashboard = {
  setup: {
    statutory: {
      status: "setup_required",
      version: "phase3i-statutory-rules-empty-v1",
      rules: [],
      message: "Statutory payroll setup required.",
    },
    calculationVersion: "phase3i-payroll-calculation-v1",
    snapshotVersion: "phase3i-payroll-snapshot-v1",
    payments: { enabled: false, status: "disabled" },
    expensePosting: { enabled: true, status: "explicit_only" },
  },
  employees: [],
  periods: [period],
  runs: [period],
  componentDefinitions: [],
};

describe("Phase 3I Payroll API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PHASE3_PAYROLL_ENABLED = "true";
    process.env.PHASE3_PAYROLL_ENABLED = "true";
    mocks.requireUser.mockResolvedValue({ id: "user_1", email: "owner@example.com" });
    mocks.enforceRateLimit.mockResolvedValue(null);
    mocks.requireAccess.mockResolvedValue(access);
    mocks.listDashboard.mockResolvedValue(payrollDashboard);
    mocks.createEmployee.mockResolvedValue({ id: "employee_1", displayName: "Ada" });
    mocks.createPeriod.mockResolvedValue(period);
    mocks.calculatePeriod.mockResolvedValue({ ...period, status: "CALCULATED" });
    mocks.getPeriod.mockResolvedValue(period);
    mocks.submitReview.mockResolvedValue({ ...period, status: "UNDER_REVIEW" });
    mocks.approvePeriod.mockResolvedValue({ ...period, status: "APPROVED" });
    mocks.postExpense.mockResolvedValue({
      period: { ...period, status: "EXPENSE_POSTED" },
      transaction: { id: "txn_1" },
      alreadyPosted: false,
    });
    mocks.reversePeriod.mockResolvedValue({ ...period, status: "REVERSED" });
    mocks.generatePayslips.mockResolvedValue([{ id: "payslip_1" }]);
    mocks.auditCreate.mockResolvedValue({});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("lists payroll through the compatibility endpoint with payroll read access", async () => {
    const { GET } = await import("@/app/api/payroll/route");
    const response = await GET(new Request("http://localhost/api/payroll?businessId=biz_1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.dashboard.periods).toHaveLength(1);
    expect(mocks.requireAccess).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: "biz_1", permission: "payroll:read" }),
    );
  });

  it("creates an employee through the resource endpoint", async () => {
    const { POST } = await import("@/app/api/payroll/employees/route");
    const response = await POST(
      new Request("http://localhost/api/payroll/employees", {
        method: "POST",
        body: JSON.stringify({
          businessId: "biz_1",
          displayName: "Ada",
          baseSalary: 100000,
          bankAccount: "1234567890",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.requireAccess).toHaveBeenCalledWith(
      expect.objectContaining({ permission: "payroll:manage_employees" }),
    );
    expect(mocks.createEmployee).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "Ada", baseSalary: 100000 }),
    );
  });

  it("prepares and calculates a payroll period", async () => {
    const periodsRoute = await import("@/app/api/payroll/periods/route");
    const calculateRoute = await import("@/app/api/payroll/periods/[id]/calculate/route");
    const createResponse = await periodsRoute.POST(
      new Request("http://localhost/api/payroll/periods", {
        method: "POST",
        body: JSON.stringify({
          businessId: "biz_1",
          periodStart: "2026-07-01",
          periodEnd: "2026-08-01",
          payDate: "2026-07-31",
        }),
      }),
    );
    const calculateResponse = await calculateRoute.POST(
      new Request("http://localhost/api/payroll/periods/period_1/calculate", {
        method: "POST",
        body: JSON.stringify({ businessId: "biz_1" }),
      }),
      { params: Promise.resolve({ id: "period_1" }) },
    );

    expect(createResponse.status).toBe(201);
    expect(calculateResponse.status).toBe(200);
    expect(mocks.createPeriod).toHaveBeenCalledWith(expect.objectContaining({ actorId: "user_1" }));
    expect(mocks.calculatePeriod).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: "biz_1", periodId: "period_1" }),
    );
  });

  it("submits, approves, posts expense, prevents duplicate posting, and generates payslips", async () => {
    const submitRoute = await import("@/app/api/payroll/periods/[id]/submit-review/route");
    const approveRoute = await import("@/app/api/payroll/periods/[id]/approve/route");
    const postRoute = await import("@/app/api/payroll/periods/[id]/post-expense/route");
    const payslipRoute = await import("@/app/api/payroll/periods/[id]/payslips/route");

    const params = { params: Promise.resolve({ id: "period_1" }) };
    await submitRoute.POST(request("submit-review"), params);
    await approveRoute.POST(request("approve"), params);
    const postResponse = await postRoute.POST(request("post-expense"), params);
    mocks.postExpense.mockResolvedValueOnce({
      period: { ...period, status: "EXPENSE_POSTED" },
      transaction: { id: "txn_1" },
      alreadyPosted: true,
    });
    const duplicatePostResponse = await postRoute.POST(request("post-expense"), params);
    const payslipResponse = await payslipRoute.GET(
      new Request("http://localhost/api/payroll/periods/period_1/payslips?businessId=biz_1"),
      params,
    );

    expect(postResponse.status).toBe(200);
    expect(duplicatePostResponse.status).toBe(200);
    expect(payslipResponse.status).toBe(200);
    expect(mocks.requireAccess).toHaveBeenCalledWith(
      expect.objectContaining({ permission: "payroll:post_expense" }),
    );
    expect(mocks.requireAccess).toHaveBeenCalledWith(
      expect.objectContaining({ permission: "payroll:read" }),
    );
    expect(mocks.generatePayslips).toHaveBeenCalledWith(
      expect.objectContaining({ periodId: "period_1", actorId: "user_1" }),
    );
  });

  it("exports CSV and returns 405 for unsupported methods", async () => {
    const exportRoute = await import("@/app/api/payroll/export/route");
    const calculateRoute = await import("@/app/api/payroll/periods/[id]/calculate/route");
    const exportResponse = await exportRoute.GET(
      new Request("http://localhost/api/payroll/export?businessId=biz_1"),
    );
    const methodResponse = calculateRoute.DELETE();

    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers.get("Content-Type")).toContain("text/csv");
    expect(methodResponse.status).toBe(405);
  });
});

function request(action: string) {
  return new Request(`http://localhost/api/payroll/periods/period_1/${action}`, {
    method: "POST",
    body: JSON.stringify({ businessId: "biz_1" }),
  });
}
