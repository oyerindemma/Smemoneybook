import { beforeEach, describe, expect, it, vi } from "vitest";

const findDebt = vi.fn();
const sendPaymentReceivedMessage = vi.fn();

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    debt: {
      findFirst: findDebt,
    },
  }),
}));

vi.mock("@/lib/whatsapp/service", () => ({
  sendPaymentReceivedMessage,
}));

describe("sendPaymentConfirmationForCollection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findDebt.mockResolvedValue({
      id: "debt_1",
      business: { name: "Hesed Business Solution" },
      customer: { name: "John", phone: "08012345678" },
      paidAmount: { toNumber: () => 25000 },
      events: [{ amount: { toNumber: () => 25000 } }],
    });
    sendPaymentReceivedMessage.mockResolvedValue({ ok: true, status: "sent" });
  });

  it("sends payment confirmation from the latest collection event", async () => {
    const { sendPaymentConfirmationForCollection } = await import("@/server/whatsapp/payment-confirmation");

    await sendPaymentConfirmationForCollection({
      userId: "user_1",
      businessId: "biz_1",
      debtId: "debt_1",
    });

    expect(sendPaymentReceivedMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "08012345678",
        customerName: "John",
        businessName: "Hesed Business Solution",
        amount: 25000,
        businessId: "biz_1",
        actorId: "user_1",
      }),
    );
  });

  it("does not send when the customer has no phone number", async () => {
    findDebt.mockResolvedValueOnce({
      customer: { name: "John", phone: null },
      business: { name: "Demo" },
      paidAmount: { toNumber: () => 25000 },
      events: [],
    });
    const { sendPaymentConfirmationForCollection } = await import("@/server/whatsapp/payment-confirmation");

    const result = await sendPaymentConfirmationForCollection({
      userId: "user_1",
      businessId: "biz_1",
      debtId: "debt_1",
    });

    expect(result.ok).toBe(false);
    expect(sendPaymentReceivedMessage).not.toHaveBeenCalled();
  });
});
