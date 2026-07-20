import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const enforceRateLimit = vi.fn();
const requireBusinessAccess = vi.fn();
const requireLocationAccess = vi.fn();
const requireMinimumPlan = vi.fn();
const listAlerts = vi.fn();
const scanAlerts = vi.fn();
const recordFeedback = vi.fn();
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

vi.mock("@/lib/phase3/predictive-alerts-service", () => ({
  listPredictiveAlerts: listAlerts,
  scanPredictiveAlertsForBusiness: scanAlerts,
  recordPredictiveAlertFeedback: recordFeedback,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    auditLog: {
      create: createAudit,
    },
  }),
}));

const alert = {
  id: "alert_1",
  businessId: "biz_1",
  alertKey: "key",
  type: "revenue_drop",
  severity: "warning",
  status: "active",
  confidence: 0.8,
  impactAmount: 10_000,
  title: "Revenue dropped",
  explanation: "Recorded sales dropped.",
  sourcePeriodStart: "2026-07-01T00:00:00.000Z",
  sourcePeriodEnd: "2026-07-15T00:00:00.000Z",
  detectedAt: "2026-07-20T00:00:00.000Z",
  sourceMetrics: {},
};

describe("/api/predictive-alerts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PHASE3_PREDICTIVE_ALERTS_ENABLED = "true";
    requireUser.mockResolvedValue({ id: "user_1" });
    enforceRateLimit.mockResolvedValue(null);
    requireBusinessAccess.mockResolvedValue({ businessId: "biz_1" });
    requireLocationAccess.mockResolvedValue({ businessId: "biz_1", locationId: "loc_1" });
    requireMinimumPlan.mockResolvedValue(null);
    listAlerts.mockResolvedValue([alert]);
    scanAlerts.mockResolvedValue([alert]);
    recordFeedback.mockResolvedValue({ ...alert, status: "incorrect" });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("requires the Phase 3 predictive alerts flag", async () => {
    process.env.NEXT_PUBLIC_PHASE3_PREDICTIVE_ALERTS_ENABLED = "false";
    vi.resetModules();

    const { GET } = await import("@/app/api/predictive-alerts/route");
    const response = await GET(new Request("http://localhost/api/predictive-alerts?businessId=biz_1"));

    expect(response.status).toBe(404);
    expect(listAlerts).not.toHaveBeenCalled();
  });

  it("lists alerts for authorized report users on Growth or higher", async () => {
    const { GET } = await import("@/app/api/predictive-alerts/route");
    const response = await GET(new Request("http://localhost/api/predictive-alerts?businessId=biz_1&locationId=loc_1"));

    expect(response.status).toBe(200);
    expect(requireBusinessAccess).toHaveBeenCalledWith("user_1", "reports:write", "biz_1");
    expect(requireLocationAccess).toHaveBeenCalledWith({
      userId: "user_1",
      businessId: "biz_1",
      locationId: "loc_1",
      permission: "reports:write",
    });
    expect(requireMinimumPlan).toHaveBeenCalledWith("user_1", "biz_1", "growth", "Upgrade to Growth to use Predictive Alerts.");
  });

  it("scans alerts and writes an audit record", async () => {
    const { POST } = await import("@/app/api/predictive-alerts/route");
    const response = await POST(
      new Request("http://localhost/api/predictive-alerts", {
        method: "POST",
        body: JSON.stringify({
          action: "scan",
          businessId: "biz_1",
          periodDays: 14,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(scanAlerts).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        periodDays: 14,
      }),
    );
    expect(createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "predictive_alerts.scanned",
        }),
      }),
    );
  });

  it("records incorrect feedback for precision tracking", async () => {
    const { POST } = await import("@/app/api/predictive-alerts/route");
    const response = await POST(
      new Request("http://localhost/api/predictive-alerts", {
        method: "POST",
        body: JSON.stringify({
          action: "incorrect",
          businessId: "biz_1",
          alertId: "alert_1",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(recordFeedback).toHaveBeenCalledWith({
      businessId: "biz_1",
      actorId: "user_1",
      alertId: "alert_1",
      response: "incorrect",
      note: undefined,
    });
  });
});
