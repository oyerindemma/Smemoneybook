import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  customerFindMany: vi.fn(),
  supplierFindMany: vi.fn(),
  routeMessage: vi.fn(),
  sendText: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    customer: { findMany: mocks.customerFindMany },
    supplier: { findMany: mocks.supplierFindMany },
    auditLog: { create: mocks.auditCreate },
  }),
}));
vi.mock("@/lib/chatbot/whatsapp-bot-router", () => ({ routeWhatsAppBotMessage: mocks.routeMessage }));
vi.mock("@/lib/whatsapp/service", () => ({ sendTextMessage: mocks.sendText }));

describe("WhatsApp bot business isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.customerFindMany.mockResolvedValue([]);
    mocks.supplierFindMany.mockResolvedValue([]);
    mocks.routeMessage.mockResolvedValue("Recorded balance summary");
    mocks.sendText.mockResolvedValue({ ok: true });
  });

  it("routes only when the sender maps to exactly one business", async () => {
    mocks.customerFindMany.mockResolvedValue([{ phone: "+234 801 234 5678", businessId: "biz_1" }]);
    const { handleIncomingWhatsAppBotMessage } = await import("@/lib/chatbot/whatsapp-bot-service");
    const result = await handleIncomingWhatsAppBotMessage({ from: "2348012345678", text: "balance" });

    expect(result.ok).toBe(true);
    expect(mocks.routeMessage).toHaveBeenCalledWith({ businessId: "biz_1", message: "balance" });
    expect(mocks.sendText).toHaveBeenCalledWith(expect.objectContaining({ businessId: "biz_1" }));
  });

  it("fails closed when the same phone appears in multiple businesses", async () => {
    mocks.customerFindMany.mockResolvedValue([
      { phone: "08012345678", businessId: "biz_1" },
      { phone: "+2348012345678", businessId: "biz_2" },
    ]);
    const { handleIncomingWhatsAppBotMessage } = await import("@/lib/chatbot/whatsapp-bot-service");
    const result = await handleIncomingWhatsAppBotMessage({ from: "2348012345678", text: "balance" });

    expect(result.ok).toBe(false);
    expect(mocks.routeMessage).not.toHaveBeenCalled();
    expect(mocks.sendText).not.toHaveBeenCalled();
  });
});
