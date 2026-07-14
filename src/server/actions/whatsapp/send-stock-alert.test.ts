import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const hasMinimumPlan = vi.fn();
const requireBusinessAccess = vi.fn();
const findInventoryItem = vi.fn();
const sendLowStockAlert = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireUser,
}));

vi.mock("@/lib/billing/subscriptions", () => ({
  hasMinimumPlan,
}));

vi.mock("@/lib/operations/access", () => ({
  requireBusinessAccess,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    inventoryItem: { findFirst: findInventoryItem },
  }),
}));

vi.mock("@/lib/whatsapp/service", () => ({
  sendLowStockAlert,
}));

describe("sendStockAlertAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user_1", name: "Owner", email: "owner@example.com" });
    hasMinimumPlan.mockResolvedValue(true);
    requireBusinessAccess.mockResolvedValue({ businessId: "biz_1", businessName: "Demo Shop" });
    findInventoryItem.mockResolvedValue({
      id: "item_1",
      name: "Rice",
      quantityOnHand: 3,
      lowStockLevel: 5,
    });
    sendLowStockAlert.mockResolvedValue({ ok: true, status: "sent", messageId: "wamid.1" });
  });

  it("sends a normalized low stock alert to the owner", async () => {
    const { sendStockAlertAction } = await import("@/server/actions/whatsapp/send-stock-alert");
    const result = await sendStockAlertAction({
      businessId: "biz_1",
      itemId: "item_1",
      ownerPhone: "08012345678",
    });

    expect(result.ok).toBe(true);
    expect(sendLowStockAlert).toHaveBeenCalledWith(expect.objectContaining({
      to: "2348012345678",
      businessName: "Demo Shop",
      productName: "Rice",
      quantityOnHand: 3,
      lowStockLevel: 5,
    }));
  });

  it("returns a WhatsApp fallback link when the Cloud API send fails", async () => {
    sendLowStockAlert.mockResolvedValueOnce({
      ok: false,
      status: "failed",
      error: "Could not send this WhatsApp message.",
    });

    const { sendStockAlertAction } = await import("@/server/actions/whatsapp/send-stock-alert");
    const result = await sendStockAlertAction({
      businessId: "biz_1",
      itemId: "item_1",
      ownerPhone: "08012345678",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Opening WhatsApp");
    expect(result.whatsappUrl).toContain("https://wa.me/2348012345678?text=");
    expect(decodeURIComponent(result.whatsappUrl ?? "")).toContain("Demo Shop stock alert: Rice has 3 left.");
  });

  it("does not call WhatsApp when the owner phone number is invalid", async () => {
    const { sendStockAlertAction } = await import("@/server/actions/whatsapp/send-stock-alert");
    const result = await sendStockAlertAction({
      businessId: "biz_1",
      itemId: "item_1",
      ownerPhone: "123",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toBe("Enter a valid Nigerian WhatsApp phone number.");
    expect(sendLowStockAlert).not.toHaveBeenCalled();
  });
});
