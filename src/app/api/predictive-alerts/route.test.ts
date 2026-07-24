import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PredictiveAlertRecord } from "@/lib/predictive-alerts/definitions";

const requireUser = vi.fn();
const enforceRateLimit = vi.fn();
const requireAccess = vi.fn();
const listAlerts = vi.fn();
const getAlert = vi.fn();
const evaluateAlerts = vi.fn();
const updateLifecycle = vi.fn();
const listPreferences = vi.fn();
const updatePreferences = vi.fn();
const toCsv = vi.fn();
const csvFilename = vi.fn();
const createAudit = vi.fn();

class MockPredictiveAlertsAccessError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "PredictiveAlertsAccessError";
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

vi.mock("@/lib/predictive-alerts/authorization", () => ({
  PredictiveAlertsAccessError: MockPredictiveAlertsAccessError,
  requirePredictiveAlertsAccess: requireAccess,
}));

vi.mock("@/lib/predictive-alerts/service", () => ({
  evaluatePredictiveAlertsForBusiness: evaluateAlerts,
  getPredictiveAlert: getAlert,
  listBusinessAlertPreferences: listPreferences,
  listPredictiveAlerts: listAlerts,
  updateBusinessAlertPreferences: updatePreferences,
  updatePredictiveAlertLifecycle: updateLifecycle,
}));

vi.mock("@/lib/predictive-alerts/export", () => ({
  predictiveAlertsCsvFilename: csvFilename,
  predictiveAlertsToCsv: toCsv,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    auditLog: { create: createAudit },
  }),
}));

const originalEnv = { ...process.env };

const access = {
  businessId: "biz_1",
  businessName: "Preview Store",
  currency: "NGN",
  userId: "user_1",
  role: "OWNER",
  locationId: "loc_1",
  locationName: "Main",
  canManage: true,
  canAcknowledge: true,
  canExport: true,
};

const alert: PredictiveAlertRecord = {
  id: "alert_1",
  businessId: "biz_1",
  locationId: "loc_1",
  alertKey: "key_1",
  ruleKey: "sales_decline",
  category: "sales_decline",
  severity: "high",
  title: "Sales declined",
  explanation: "Recorded sales declined against the previous period.",
  recommendedAction: "Review sales activity before taking action.",
  evidence: {
    whatChanged: "Sales dropped by 40%.",
    comparedPeriod: "Current period against previous period.",
    metricValues: { currentSales: 30_000, previousSales: 50_000 },
    threshold: { dropPercent: 30 },
    formula: "previousSales - currentSales >= threshold",
    sourceData: ["Transaction"],
    missingData: [],
    recommendedReviewAction: "Review sales activity before taking action.",
    disclaimer: "Deterministic alert only.",
  },
  period: {
    label: "current_period",
    start: "2026-07-01T00:00:00.000Z",
    end: "2026-07-31T00:00:00.000Z",
  },
  impactAmount: 20_000,
  confidence: 0.82,
  formulaReference: "predictive.sales_decline.v2",
  dedupeKey: "biz_1:sales_decline",
  sourceMetrics: { currentSales: 30_000, previousSales: 50_000 },
  missingData: [],
  delivery: { inApp: true, email: false, whatsapp: false },
  lifecycleStatus: "active",
  legacyStatus: "active",
  legacySeverity: "warning",
  firstDetectedAt: "2026-07-20T00:00:00.000Z",
  lastDetectedAt: "2026-07-20T00:00:00.000Z",
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-20T00:00:00.000Z",
  deliveryCount: 1,
};

describe("Predictive Alerts API routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PHASE3_PREDICTIVE_ALERTS_ENABLED = "true";
    process.env.PHASE3_PREDICTIVE_ALERTS_ENABLED = "true";
    requireUser.mockResolvedValue({ id: "user_1" });
    enforceRateLimit.mockResolvedValue(null);
    requireAccess.mockResolvedValue(access);
    listAlerts.mockResolvedValue([alert]);
    getAlert.mockResolvedValue(alert);
    evaluateAlerts.mockResolvedValue({
      alerts: [alert],
      generatedCount: 1,
      resolvedCount: 0,
      dataQuality: { status: "complete", notes: [] },
    });
    updateLifecycle.mockResolvedValue(alert);
    listPreferences.mockResolvedValue([
      {
        ruleKey: "sales_decline",
        enabled: true,
        category: "sales_decline",
        severity: "high",
        description: "Recorded sales declined.",
        formulaReference: "predictive.sales_decline.v2",
        inAppEnabled: true,
        emailEnabled: false,
        whatsappEnabled: false,
        emailDeliveryAvailable: false,
        whatsappDeliveryAvailable: false,
      },
    ]);
    updatePreferences.mockResolvedValue([]);
    toCsv.mockReturnValue("rule_key,title\nsales_decline,Sales declined\n");
    csvFilename.mockReturnValue("predictive-alerts-2026-07-24.csv");
    createAudit.mockResolvedValue({ id: "audit_1" });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("lists alerts for authorized owners with filters and business isolation", async () => {
    const { GET } = await import("@/app/api/predictive-alerts/route");
    const response = await GET(
      new Request(
        "http://localhost/api/predictive-alerts?businessId=biz_1&locationId=loc_1&status=active,acknowledged&severity=high&category=sales_decline",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.alerts).toEqual([alert]);
    expect(payload.capabilities.delivery).toEqual({ inApp: true, email: false, whatsapp: false });
    expect(requireAccess).toHaveBeenCalledWith({
      userId: "user_1",
      businessId: "biz_1",
      locationId: "loc_1",
      permission: "predictive_alerts:read",
    });
    expect(listAlerts).toHaveBeenCalledWith({
      businessId: "biz_1",
      locationId: "loc_1",
      statuses: ["active", "acknowledged"],
      severity: "high",
      category: "sales_decline",
      periodDays: undefined,
    });
  });

  it("returns feature-disabled and unauthorized rejections before service execution", async () => {
    requireAccess.mockRejectedValueOnce(
      new MockPredictiveAlertsAccessError("Predictive Alerts are unavailable in this environment.", 503, "feature_disabled"),
    );

    const { GET } = await import("@/app/api/predictive-alerts/route");
    const disabled = await GET(new Request("http://localhost/api/predictive-alerts?businessId=biz_1"));

    expect(disabled.status).toBe(503);
    expect(listAlerts).not.toHaveBeenCalled();

    requireAccess.mockRejectedValueOnce(
      new MockPredictiveAlertsAccessError("You do not have access to this business.", 403, "business_access_denied"),
    );

    const rejected = await GET(new Request("http://localhost/api/predictive-alerts?businessId=other_biz"));

    expect(rejected.status).toBe(403);
    expect(listAlerts).not.toHaveBeenCalled();
  });

  it("keeps collection writes disabled with 405 responses", async () => {
    const route = await import("@/app/api/predictive-alerts/route");

    for (const method of [route.POST, route.PUT, route.PATCH, route.DELETE]) {
      const response = method();
      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("GET");
    }
  });

  it("runs deterministic evaluation with manage permission and audit evidence", async () => {
    const { POST, GET } = await import("@/app/api/predictive-alerts/evaluate/route");
    const blockedRead = GET();
    const response = await POST(new Request("http://localhost/api/predictive-alerts/evaluate?businessId=biz_1&periodDays=30"));
    const payload = await response.json();

    expect(blockedRead.status).toBe(405);
    expect(response.status).toBe(200);
    expect(payload.generatedCount).toBe(1);
    expect(requireAccess).toHaveBeenCalledWith(
      expect.objectContaining({ permission: "predictive_alerts:manage" }),
    );
    expect(evaluateAlerts).toHaveBeenCalledWith({
      businessId: "biz_1",
      locationId: "loc_1",
      periodDays: 30,
    });
    expect(createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "predictive_alerts.evaluation_run",
        }),
      }),
    );
  });

  it("loads staff detail style evidence through the alert detail endpoint", async () => {
    const { GET, POST } = await import("@/app/api/predictive-alerts/[id]/route");
    const response = await GET(
      new Request("http://localhost/api/predictive-alerts/alert_1?businessId=biz_1"),
      { params: Promise.resolve({ id: "alert_1" }) },
    );
    const blockedWrite = POST();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.alert.evidence.metricValues.currentSales).toBe(30_000);
    expect(getAlert).toHaveBeenCalledWith({ businessId: "biz_1", alertId: "alert_1" });
    expect(blockedWrite.status).toBe(405);
  });

  it("acknowledges, dismisses, and reopens alerts through explicit lifecycle endpoints", async () => {
    const acknowledge = await import("@/app/api/predictive-alerts/[id]/acknowledge/route");
    const dismiss = await import("@/app/api/predictive-alerts/[id]/dismiss/route");
    const reopen = await import("@/app/api/predictive-alerts/[id]/reopen/route");

    const acknowledged = await acknowledge.POST(
      new Request("http://localhost/api/predictive-alerts/alert_1/acknowledge?businessId=biz_1", { method: "POST" }),
      { params: Promise.resolve({ id: "alert_1" }) },
    );
    const dismissed = await dismiss.POST(
      new Request("http://localhost/api/predictive-alerts/alert_1/dismiss?businessId=biz_1", {
        method: "POST",
        body: JSON.stringify({ reason: "Reviewed in QA." }),
      }),
      { params: Promise.resolve({ id: "alert_1" }) },
    );
    const reopened = await reopen.POST(
      new Request("http://localhost/api/predictive-alerts/alert_1/reopen?businessId=biz_1", { method: "POST" }),
      { params: Promise.resolve({ id: "alert_1" }) },
    );

    expect(acknowledged.status).toBe(200);
    expect(dismissed.status).toBe(200);
    expect(reopened.status).toBe(200);
    expect(updateLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ alertId: "alert_1", action: "acknowledge" }),
    );
    expect(updateLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ alertId: "alert_1", action: "dismiss", reason: "Reviewed in QA." }),
    );
    expect(updateLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ alertId: "alert_1", action: "reopen" }),
    );
    expect(acknowledge.GET().status).toBe(405);
    expect(dismiss.PUT().status).toBe(405);
    expect(reopen.DELETE().status).toBe(405);
  });

  it("loads and updates preferences while keeping Preview delivery disabled", async () => {
    const { GET, PUT, POST } = await import("@/app/api/predictive-alerts/preferences/route");
    const read = await GET(new Request("http://localhost/api/predictive-alerts/preferences?businessId=biz_1"));
    const write = await PUT(
      new Request("http://localhost/api/predictive-alerts/preferences?businessId=biz_1", {
        method: "PUT",
        body: JSON.stringify({
          preferences: [
            {
              ruleKey: "sales_decline",
              enabled: false,
              thresholdOverride: { dropPercent: 35 },
              emailEnabled: true,
              whatsappEnabled: true,
            },
          ],
        }),
      }),
    );

    expect(read.status).toBe(200);
    expect(write.status).toBe(200);
    expect(updatePreferences).toHaveBeenCalledWith({
      businessId: "biz_1",
      preferences: [
        expect.objectContaining({
          ruleKey: "sales_decline",
          enabled: false,
          emailEnabled: false,
          whatsappEnabled: false,
        }),
      ],
    });
    expect(POST().status).toBe(405);
  });

  it("exports CSV only through the export endpoint", async () => {
    const { GET, DELETE } = await import("@/app/api/predictive-alerts/export/route");
    const response = await GET(
      new Request("http://localhost/api/predictive-alerts/export?businessId=biz_1&status=active,resolved"),
    );
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("Content-Disposition")).toContain("predictive-alerts-2026-07-24.csv");
    expect(csv).toContain("sales_decline");
    expect(requireAccess).toHaveBeenCalledWith(
      expect.objectContaining({ permission: "predictive_alerts:export" }),
    );
    expect(listAlerts).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        statuses: ["active", "resolved"],
        take: 500,
      }),
    );
    expect(DELETE().status).toBe(405);
  });
});
