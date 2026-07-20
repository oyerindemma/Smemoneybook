import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const enforceRateLimit = vi.fn();
const requireBusinessAccess = vi.fn();
const requireLocationAccess = vi.fn();
const requireMinimumPlan = vi.fn();
const listDashboard = vi.fn();
const createEmployee = vi.fn();
const draftRun = vi.fn();
const approveRun = vi.fn();
const lockRun = vi.fn();
const reverseRun = vi.fn();
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
  requireLocationAccess,
}));

vi.mock("@/lib/billing/subscriptions", () => ({
  requireMinimumPlan,
}));

vi.mock("@/lib/phase3/payroll-service", () => ({
  listPayrollDashboard: listDashboard,
  createPayrollEmployee: createEmployee,
  draftPayrollRun: draftRun,
  approvePayrollRun: approveRun,
  lockPayrollRun: lockRun,
  reversePayrollRun: reverseRun,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    auditLog: {
      create: createAudit,
    },
  }),
}));

describe("/api/payroll", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PHASE3_PAYROLL_ENABLED = "true";
    requireUser.mockResolvedValue({ id: "user_1" });
    enforceRateLimit.mockResolvedValue(null);
    requireBusinessAccess.mockResolvedValue({ businessId: "biz_1" });
    requireLocationAccess.mockResolvedValue({ businessId: "biz_1", locationId: "loc_1" });
    requireMinimumPlan.mockResolvedValue(null);
    listDashboard.mockResolvedValue({ employees: [], runs: [] });
    createEmployee.mockResolvedValue({ id: "employee_1" });
    draftRun.mockResolvedValue({ id: "run_1" });
    approveRun.mockResolvedValue({ id: "run_1", status: "APPROVED" });
    lockRun.mockResolvedValue({ id: "run_1", status: "LOCKED" });
    reverseRun.mockResolvedValue({ id: "run_1", status: "REVERSED" });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("requires the Phase 3 payroll flag", async () => {
    process.env.NEXT_PUBLIC_PHASE3_PAYROLL_ENABLED = "false";
    vi.resetModules();

    const { GET } = await import("@/app/api/payroll/route");
    const response = await GET(new Request("http://localhost/api/payroll?businessId=biz_1"));

    expect(response.status).toBe(404);
    expect(listDashboard).not.toHaveBeenCalled();
  });

  it("requires admin business access and Pro plan to list payroll", async () => {
    const { GET } = await import("@/app/api/payroll/route");
    const response = await GET(new Request("http://localhost/api/payroll?businessId=biz_1&locationId=loc_1"));

    expect(response.status).toBe(200);
    expect(requireBusinessAccess).toHaveBeenCalledWith("user_1", "admin", "biz_1");
    expect(requireLocationAccess).toHaveBeenCalledWith({
      userId: "user_1",
      businessId: "biz_1",
      locationId: "loc_1",
      permission: "admin",
    });
    expect(requireMinimumPlan).toHaveBeenCalledWith("user_1", "biz_1", "pro", "Upgrade to Pro to use Payroll.");
  });

  it("creates employees without exposing the route to non-admin permissions", async () => {
    const { POST } = await import("@/app/api/payroll/route");
    const response = await POST(
      new Request("http://localhost/api/payroll", {
        method: "POST",
        body: JSON.stringify({
          action: "create_employee",
          businessId: "biz_1",
          displayName: "Ada",
          baseSalary: 100000,
          pensionNumber: "PEN123456789",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(createEmployee).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        displayName: "Ada",
        baseSalary: 100000,
        pensionNumber: "PEN123456789",
      }),
    );
    expect(createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "payroll.create_employee",
          businessId: "biz_1",
        }),
      }),
    );
  });

  it("drafts a run from explicit payroll inputs", async () => {
    const { POST } = await import("@/app/api/payroll/route");
    const response = await POST(
      new Request("http://localhost/api/payroll", {
        method: "POST",
        body: JSON.stringify({
          action: "draft_run",
          businessId: "biz_1",
          periodStart: "2026-07-01T00:00:00.000Z",
          periodEnd: "2026-08-01T00:00:00.000Z",
          payDate: "2026-07-31T00:00:00.000Z",
          adjustments: [{ employeeId: "employee_1", bonuses: [{ label: "Sales bonus", amount: 5000 }] }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(draftRun).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        actorId: "user_1",
        adjustments: [{ employeeId: "employee_1", bonuses: [{ label: "Sales bonus", amount: 5000 }] }],
      }),
    );
  });

  it("locks approved payroll runs through an explicit action", async () => {
    const { POST } = await import("@/app/api/payroll/route");
    const response = await POST(
      new Request("http://localhost/api/payroll", {
        method: "POST",
        body: JSON.stringify({
          action: "lock_run",
          businessId: "biz_1",
          runId: "run_1",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(lockRun).toHaveBeenCalledWith({
      businessId: "biz_1",
      runId: "run_1",
      actorId: "user_1",
    });
  });
});
