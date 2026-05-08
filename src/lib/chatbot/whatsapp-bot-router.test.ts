import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/assistant/assistant-context", () => ({
  getBusinessAssistantContext: vi.fn().mockResolvedValue({
    today: { income: 105000, expenses: 0, profit: 105000 },
    debts: { customerDebtTotal: 5000 },
    stock: { lowStockCount: 1, lowStockItems: [{ name: "Clothes", quantityOnHand: 2 }] },
    report: { monthIncome: 105000, monthExpenses: 0, monthProfit: 105000 },
  }),
}));

describe("WhatsApp bot router", () => {
  it("answers today command", async () => {
    const { routeWhatsAppBotMessage } = await import("@/lib/chatbot/whatsapp-bot-router");
    await expect(routeWhatsAppBotMessage({ businessId: "biz_1", message: "today" })).resolves.toBe(
      "Today: ₦105,000 in, ₦0 out, ₦105,000 profit.",
    );
  });

  it("answers low stock command", async () => {
    const { routeWhatsAppBotMessage } = await import("@/lib/chatbot/whatsapp-bot-router");
    await expect(routeWhatsAppBotMessage({ businessId: "biz_1", message: "low stock" })).resolves.toBe(
      "Low stock: Clothes, 2 left.",
    );
  });
});
