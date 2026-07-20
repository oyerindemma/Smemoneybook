import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const enforceRateLimit = vi.fn();
const requireBusinessAccess = vi.fn();
const requireMinimumPlan = vi.fn();
const listDashboard = vi.fn();
const upsertContact = vi.fn();
const upsertTemplate = vi.fn();
const queueJob = vi.fn();
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
}));

vi.mock("@/lib/billing/subscriptions", () => ({
  requireMinimumPlan,
}));

vi.mock("@/lib/phase3/whatsapp-automation-service", () => ({
  listWhatsAppAutomationDashboard: listDashboard,
  upsertWhatsAppAutomationContact: upsertContact,
  upsertWhatsAppAutomationTemplate: upsertTemplate,
  queueWhatsAppAutomationJob: queueJob,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    auditLog: {
      create: createAudit,
    },
  }),
}));

describe("/api/whatsapp-automation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PHASE3_WHATSAPP_AUTOMATION_ENABLED = "true";
    requireUser.mockResolvedValue({ id: "user_1" });
    enforceRateLimit.mockResolvedValue(null);
    requireBusinessAccess.mockResolvedValue({ businessId: "biz_1" });
    requireMinimumPlan.mockResolvedValue(null);
    listDashboard.mockResolvedValue({ contacts: [], templates: [], recentJobs: [], health: {} });
    upsertContact.mockResolvedValue({ id: "contact_1" });
    upsertTemplate.mockResolvedValue({ id: "template_1" });
    queueJob.mockResolvedValue({ id: "job_1", status: "QUEUED" });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("requires the Phase 3 WhatsApp automation flag", async () => {
    process.env.NEXT_PUBLIC_PHASE3_WHATSAPP_AUTOMATION_ENABLED = "false";
    vi.resetModules();

    const { GET } = await import("@/app/api/whatsapp-automation/route");
    const response = await GET(new Request("http://localhost/api/whatsapp-automation?businessId=biz_1"));

    expect(response.status).toBe(404);
    expect(listDashboard).not.toHaveBeenCalled();
  });

  it("requires admin access and Growth plan", async () => {
    const { GET } = await import("@/app/api/whatsapp-automation/route");
    const response = await GET(new Request("http://localhost/api/whatsapp-automation?businessId=biz_1"));

    expect(response.status).toBe(200);
    expect(requireBusinessAccess).toHaveBeenCalledWith("user_1", "admin", "biz_1");
    expect(requireMinimumPlan).toHaveBeenCalledWith(
      "user_1",
      "biz_1",
      "growth",
      "Upgrade to Growth to use WhatsApp automation.",
    );
  });

  it("records explicit contact consent state", async () => {
    const { POST } = await import("@/app/api/whatsapp-automation/route");
    const response = await POST(
      new Request("http://localhost/api/whatsapp-automation", {
        method: "POST",
        body: JSON.stringify({
          action: "upsert_contact",
          businessId: "biz_1",
          phone: "08012345678",
          name: "Ada",
          consentStatus: "OPTED_IN",
          consentSource: "checkout",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(upsertContact).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        phone: "08012345678",
        consentStatus: "OPTED_IN",
      }),
    );
    expect(createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "whatsapp_automation.upsert_contact",
        }),
      }),
    );
  });

  it("queues automation messages without sending directly", async () => {
    const { POST } = await import("@/app/api/whatsapp-automation/route");
    const response = await POST(
      new Request("http://localhost/api/whatsapp-automation", {
        method: "POST",
        body: JSON.stringify({
          action: "queue_message",
          businessId: "biz_1",
          phone: "08012345678",
          automationType: "payment_confirmation",
          templateName: "payment_confirmation",
          messagePreview: "Payment received",
          costKobo: 200,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(queueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        actorId: "user_1",
        automationType: "payment_confirmation",
        templateName: "payment_confirmation",
      }),
    );
  });
});
