import { beforeEach, describe, expect, it, vi } from "vitest";

const getBusinessAssistantContext = vi.fn();
const upsertPreference = vi.fn();

vi.mock("@/lib/assistant/assistant-context", () => ({
  getBusinessAssistantContext,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    automationPreference: {
      upsert: upsertPreference,
    },
  }),
}));

describe("automation rules v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBusinessAssistantContext.mockResolvedValue({
      today: { transactionCount: 0 },
      debts: { topDebtors: [{ name: "John", amount: 5000, overdue: true }] },
      stock: { lowStockItems: [{ name: "Clothes", quantityOnHand: 2, lowStockLevel: 5 }] },
      report: { monthIncome: 100000, monthExpenses: 20000, monthProfit: 80000 },
    });
    upsertPreference.mockResolvedValue({
      dailyReminderEnabled: true,
      debtReminderEnabled: true,
      lowStockAlertEnabled: true,
      weeklySummaryEnabled: false,
    });
  });

  it("creates safe in-app automation suggestions", async () => {
    const { buildAutomationSuggestions } = await import("@/lib/automation/automation-rules");
    const suggestions = await buildAutomationSuggestions("biz_1", new Date("2026-05-08T18:00:00.000Z"));

    expect(suggestions.map((suggestion) => suggestion.type)).toEqual([
      "daily_money_reminder",
      "debt_reminder_suggestion",
      "low_stock_alert",
    ]);
    expect(suggestions[2]?.message).toBe("Clothes is low. 2 left.");
  });
});
