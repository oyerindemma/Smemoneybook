import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const enforceRateLimit = vi.fn();
const requireBusinessAccess = vi.fn();
const requireLocationAccess = vi.fn();
const requireMinimumPlan = vi.fn();
const requireFeatureAccess = vi.fn();
const calculateSummary = vi.fn();
const saveSnapshot = vi.fn();
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
  requireFeatureAccess,
}));

vi.mock("@/lib/phase3/tax-assistant-service", () => ({
  calculateTaxAssistantForBusiness: calculateSummary,
  saveTaxAssistantSnapshot: saveSnapshot,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    auditLog: {
      create: createAudit,
    },
  }),
}));

const summary = {
  businessId: "biz_1",
  ruleVersion: "tax-assistant-ng-v1",
  country: "NG",
  confidence: "medium",
  generatedAt: "2026-07-19T06:00:00.000Z",
  periodStart: "2026-07-01T00:00:00.000Z",
  periodEnd: "2026-08-01T00:00:00.000Z",
  taxableSales: 100000,
  estimatedTax: 7500,
  configuredRates: [],
  missingSettings: [],
  inconsistencies: [],
  reminders: [],
  exportSummary: {},
  dataWarnings: [],
  sourceMetrics: {},
  disclaimer: "This is not tax advice.",
};

describe("/api/tax-assistant", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PHASE3_TAX_ASSISTANT_ENABLED = "true";
    requireUser.mockResolvedValue({ id: "user_1" });
    enforceRateLimit.mockResolvedValue(null);
    requireBusinessAccess.mockResolvedValue({ businessId: "biz_1" });
    requireLocationAccess.mockResolvedValue({ businessId: "biz_1", locationId: "loc_1" });
    requireMinimumPlan.mockResolvedValue(null);
    requireFeatureAccess.mockResolvedValue(null);
    calculateSummary.mockResolvedValue(summary);
    saveSnapshot.mockResolvedValue({ id: "tax_assist_snap_1" });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("requires the Phase 3 tax assistant flag", async () => {
    process.env.NEXT_PUBLIC_PHASE3_TAX_ASSISTANT_ENABLED = "false";
    vi.resetModules();

    const { GET } = await import("@/app/api/tax-assistant/route");
    const response = await GET(new Request("http://localhost/api/tax-assistant?businessId=biz_1"));

    expect(response.status).toBe(404);
    expect(calculateSummary).not.toHaveBeenCalled();
  });

  it("calculates a gated tax assistant summary", async () => {
    const { GET } = await import("@/app/api/tax-assistant/route");
    const response = await GET(
      new Request("http://localhost/api/tax-assistant?businessId=biz_1&locationId=loc_1&month=7&year=2026"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.summary.estimatedTax).toBe(7500);
    expect(requireBusinessAccess).toHaveBeenCalledWith("user_1", "reports:write", "biz_1");
    expect(requireFeatureAccess).toHaveBeenCalledWith("user_1", "biz_1", "tax_management");
    expect(calculateSummary).toHaveBeenCalledWith({
      businessId: "biz_1",
      locationId: "loc_1",
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-08-01T00:00:00.000Z"),
    });
  });

  it("saves a tax assistant snapshot and audits the action", async () => {
    const { POST } = await import("@/app/api/tax-assistant/route");
    const response = await POST(
      new Request("http://localhost/api/tax-assistant", {
        method: "POST",
        body: JSON.stringify({ businessId: "biz_1", month: 7, year: 2026, recalculatedFromId: "old_snap" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.snapshotId).toBe("tax_assist_snap_1");
    expect(saveSnapshot).toHaveBeenCalledWith({ summary, recalculatedFromId: "old_snap" });
    expect(createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "tax_assistant.snapshot_saved",
          businessId: "biz_1",
        }),
      }),
    );
  });
});
