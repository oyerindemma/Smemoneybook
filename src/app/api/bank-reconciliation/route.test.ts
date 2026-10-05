import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const enforceRateLimit = vi.fn();
const requireAccess = vi.fn();
const importStatement = vi.fn();
const listImports = vi.fn();
const getImport = vi.fn();
const listEntries = vi.fn();
const exportReconciliation = vi.fn();
const confirmMatch = vi.fn();
const rejectMatch = vi.fn();
const originalEnv = { ...process.env };

class MockBankReconciliationAccessError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

vi.mock("@/lib/auth/session", () => ({
  requireUser,
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  enforceRateLimit,
}));

vi.mock("@/lib/bank-reconciliation/authorization", () => ({
  BankReconciliationAccessError: MockBankReconciliationAccessError,
  requireBankReconciliationAccess: requireAccess,
}));

vi.mock("@/lib/bank-reconciliation/service", () => ({
  importBankStatementForBusiness: importStatement,
  listBankReconciliationImports: listImports,
  getBankReconciliationImport: getImport,
  listBankReconciliationEntries: listEntries,
  exportBankReconciliation: exportReconciliation,
  confirmBankReconciliationMatch: confirmMatch,
  rejectBankReconciliationMatch: rejectMatch,
  lockBankStatementImport: vi.fn(),
  reopenBankStatementImport: vi.fn(),
}));

describe("bank reconciliation API routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PHASE3_BANK_RECONCILIATION_ENABLED = "true";
    process.env.PHASE3_BANK_RECONCILIATION_ENABLED = "true";
    requireUser.mockResolvedValue({ id: "user_1" });
    enforceRateLimit.mockResolvedValue(null);
    requireAccess.mockResolvedValue({
      businessId: "biz_1",
      businessName: "Preview Shop",
      currency: "NGN",
      userId: "user_1",
      role: "OWNER",
    });
    importStatement.mockResolvedValue({
      importId: "import_1",
      rowCount: 2,
      duplicateRowCount: 0,
      suggestedMatchCount: 1,
      warnings: [],
      message: "Bank statement imported for review.",
    });
    listImports.mockResolvedValue([{ id: "import_1", status: "IMPORTED" }]);
    getImport.mockResolvedValue({ id: "import_1", rows: [] });
    listEntries.mockResolvedValue({
      entries: [{ id: "entry_1", status: "SUGGESTED" }],
      summary: { total: 1, suggested: 1, unmatched: 0, matched: 0, ignored: 0, duplicates: 0, unresolved: 1 },
    });
    exportReconciliation.mockResolvedValue({
      csv: "entry_id,status\nentry_1,SUGGESTED\n",
      filename: "bank-reconciliation.csv",
      rowCount: 1,
    });
    confirmMatch.mockResolvedValue({ id: "import_1", matchedCount: 1 });
    rejectMatch.mockResolvedValue({ id: "import_1", matchedCount: 0 });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("returns feature-disabled errors from the exact server-side gate", async () => {
    requireAccess.mockRejectedValueOnce(
      new MockBankReconciliationAccessError("Bank Reconciliation is unavailable in this environment.", 503, "feature_disabled"),
    );

    const { GET } = await import("@/app/api/bank-reconciliation/imports/route");
    const response = await GET(new Request("http://localhost/api/bank-reconciliation/imports?businessId=biz_1"));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toBe("Bank Reconciliation is unavailable in this environment.");
    expect(listImports).not.toHaveBeenCalled();
  });

  it("lists imports for an owner with read permission", async () => {
    const { GET } = await import("@/app/api/bank-reconciliation/imports/route");
    const response = await GET(new Request("http://localhost/api/bank-reconciliation/imports?businessId=biz_1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.imports).toHaveLength(1);
    expect(requireAccess).toHaveBeenCalledWith({
      userId: "user_1",
      businessId: "biz_1",
      permission: "bank_reconciliation:read",
    });
  });

  it("imports a CSV statement using the authorized business and location", async () => {
    requireAccess.mockResolvedValueOnce({
      businessId: "biz_1",
      businessName: "Preview Shop",
      currency: "NGN",
      userId: "user_1",
      role: "OWNER",
      locationId: "loc_1",
    });

    const { POST } = await import("@/app/api/bank-reconciliation/imports/route");
    const response = await POST(
      new Request("http://localhost/api/bank-reconciliation/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: "biz_injected",
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
    expect(importStatement).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        userId: "user_1",
        accountId: "acct_1",
        locationId: "loc_1",
      }),
    );
  });

  it("rejects unauthorized users before calling reconciliation services", async () => {
    requireAccess.mockRejectedValueOnce(
      new MockBankReconciliationAccessError("You do not have access to this business.", 403, "business_access_denied"),
    );

    const { GET } = await import("@/app/api/bank-reconciliation/entries/route");
    const response = await GET(new Request("http://localhost/api/bank-reconciliation/entries?businessId=other_biz"));

    expect(response.status).toBe(403);
    expect(listEntries).not.toHaveBeenCalled();
  });

  it("passes date filters to the entries query", async () => {
    const { GET } = await import("@/app/api/bank-reconciliation/entries/route");
    const response = await GET(
      new Request(
        "http://localhost/api/bank-reconciliation/entries?businessId=biz_1&status=UNMATCHED&from=2026-07-01&to=2026-07-31&query=ada",
      ),
    );

    expect(response.status).toBe(200);
    expect(listEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        status: "UNMATCHED",
        query: "ada",
        from: new Date("2026-07-01"),
        to: new Date("2026-07-31"),
      }),
    );
  });

  it("exports CSV only with export permission", async () => {
    const { GET } = await import("@/app/api/bank-reconciliation/export/route");
    const response = await GET(new Request("http://localhost/api/bank-reconciliation/export?businessId=biz_1"));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(body).toContain("entry_1");
    expect(requireAccess).toHaveBeenCalledWith({
      userId: "user_1",
      businessId: "biz_1",
      permission: "bank_reconciliation:export",
    });
  });

  it("confirms and rejects suggested matches through review endpoints", async () => {
    const confirmRoute = await import("@/app/api/bank-reconciliation/matches/[id]/confirm/route");
    const rejectRoute = await import("@/app/api/bank-reconciliation/matches/[id]/reject/route");

    const confirmResponse = await confirmRoute.POST(
      new Request("http://localhost/api/bank-reconciliation/matches/match_1/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: "biz_1" }),
      }),
      { params: Promise.resolve({ id: "match_1" }) },
    );
    const rejectResponse = await rejectRoute.POST(
      new Request("http://localhost/api/bank-reconciliation/matches/match_2/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: "biz_1" }),
      }),
      { params: Promise.resolve({ id: "match_2" }) },
    );

    expect(confirmResponse.status).toBe(200);
    expect(rejectResponse.status).toBe(200);
    expect(confirmMatch).toHaveBeenCalledWith({
      businessId: "biz_1",
      userId: "user_1",
      matchId: "match_1",
      notes: undefined,
    });
    expect(rejectMatch).toHaveBeenCalledWith({
      businessId: "biz_1",
      userId: "user_1",
      matchId: "match_2",
      notes: undefined,
    });
  });

  it("leaves unsupported write handlers undefined on read-only entry detail route", async () => {
    const route = await import("@/app/api/bank-reconciliation/entries/[id]/route");

    expect(route.GET).toBeTypeOf("function");
    expect("POST" in route).toBe(false);
    expect("PUT" in route).toBe(false);
    expect("PATCH" in route).toBe(false);
    expect("DELETE" in route).toBe(false);
  });
});
