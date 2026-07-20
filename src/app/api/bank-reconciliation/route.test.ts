import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const enforceRateLimit = vi.fn();
const requireBusinessAccess = vi.fn();
const requireLocationAccess = vi.fn();
const requireMinimumPlan = vi.fn();
const importStatement = vi.fn();
const listImports = vi.fn();
const getImport = vi.fn();
const confirmMatch = vi.fn();
const rejectMatch = vi.fn();
const lockImport = vi.fn();
const reopenImport = vi.fn();
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

vi.mock("@/lib/phase3/bank-reconciliation-service", () => ({
  importBankStatementForBusiness: importStatement,
  listBankReconciliationImports: listImports,
  getBankReconciliationImport: getImport,
  confirmBankReconciliationMatch: confirmMatch,
  rejectBankReconciliationMatch: rejectMatch,
  lockBankStatementImport: lockImport,
  reopenBankStatementImport: reopenImport,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    auditLog: {
      create: createAudit,
    },
  }),
}));

describe("/api/bank-reconciliation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PHASE3_BANK_RECONCILIATION_ENABLED = "true";
    requireUser.mockResolvedValue({ id: "user_1" });
    enforceRateLimit.mockResolvedValue(null);
    requireBusinessAccess.mockResolvedValue({ businessId: "biz_1" });
    requireLocationAccess.mockResolvedValue({ businessId: "biz_1", locationId: "loc_1" });
    requireMinimumPlan.mockResolvedValue(null);
    importStatement.mockResolvedValue({
      importId: "import_1",
      rowCount: 2,
      duplicateRowCount: 0,
      suggestedMatchCount: 1,
      warnings: [],
      suggestions: [],
    });
    listImports.mockResolvedValue([{ id: "import_1", status: "IMPORTED" }]);
    getImport.mockResolvedValue({ id: "import_1", rows: [] });
    confirmMatch.mockResolvedValue({ id: "import_1", matchedCount: 1 });
    rejectMatch.mockResolvedValue({ id: "import_1", matchedCount: 0 });
    lockImport.mockResolvedValue({ id: "import_1", status: "LOCKED" });
    reopenImport.mockResolvedValue({ id: "import_1", status: "REOPENED" });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("requires the Phase 3 bank reconciliation flag", async () => {
    process.env.NEXT_PUBLIC_PHASE3_BANK_RECONCILIATION_ENABLED = "false";
    vi.resetModules();

    const { GET } = await import("@/app/api/bank-reconciliation/route");
    const response = await GET(new Request("http://localhost/api/bank-reconciliation?businessId=biz_1"));

    expect(response.status).toBe(404);
    expect(listImports).not.toHaveBeenCalled();
  });

  it("lists imports for an authorized business", async () => {
    const { GET } = await import("@/app/api/bank-reconciliation/route");
    const response = await GET(new Request("http://localhost/api/bank-reconciliation?businessId=biz_1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.imports).toHaveLength(1);
    expect(requireBusinessAccess).toHaveBeenCalledWith("user_1", "money:write", "biz_1");
    expect(requireMinimumPlan).toHaveBeenCalledWith(
      "user_1",
      "biz_1",
      "growth",
      "Upgrade to Growth to use Bank Reconciliation.",
    );
  });

  it("imports a CSV statement with location access and audits the import", async () => {
    const { POST } = await import("@/app/api/bank-reconciliation/route");
    const response = await POST(
      new Request("http://localhost/api/bank-reconciliation", {
        method: "POST",
        body: JSON.stringify({
          businessId: "biz_1",
          accountId: "acct_1",
          locationId: "loc_1",
          fileName: "statement.csv",
          csv: "Date,Description,Amount\n2026-07-19,Ada payment,15000",
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.importId).toBe("import_1");
    expect(requireLocationAccess).toHaveBeenCalledWith({
      userId: "user_1",
      businessId: "biz_1",
      locationId: "loc_1",
      permission: "money:write",
    });
    expect(importStatement).toHaveBeenCalledWith({
      businessId: "biz_1",
      userId: "user_1",
      csv: "Date,Description,Amount\n2026-07-19,Ada payment,15000",
      fileName: "statement.csv",
      accountId: "acct_1",
      locationId: "loc_1",
    });
    expect(createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "bank_reconciliation.imported",
          businessId: "biz_1",
        }),
      }),
    );
  });

  it("confirms a suggested match and audits the action", async () => {
    const { PATCH } = await import("@/app/api/bank-reconciliation/route");
    const response = await PATCH(
      new Request("http://localhost/api/bank-reconciliation", {
        method: "PATCH",
        body: JSON.stringify({
          businessId: "biz_1",
          importId: "import_1",
          action: "confirm_match",
          matchId: "match_1",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(confirmMatch).toHaveBeenCalledWith({
      businessId: "biz_1",
      userId: "user_1",
      matchId: "match_1",
      notes: undefined,
    });
    expect(createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "bank_reconciliation.confirm_match",
          businessId: "biz_1",
        }),
      }),
    );
  });
});
