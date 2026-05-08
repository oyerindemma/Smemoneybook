import { describe, expect, it } from "vitest";
import { findLowStockRules, findOverdueReminderRules } from "@/lib/automation/rules";

describe("automation rules", () => {
  it("creates overdue reminder rules after three days", () => {
    const rules = findOverdueReminderRules(
      [
        {
          id: "debt_1",
          type: "customer_owes_business",
          status: "open",
          dueAt: "2026-05-01T00:00:00.000Z",
        },
      ] as never,
      new Date("2026-05-08T00:00:00.000Z"),
    );

    expect(rules).toEqual([
      { type: "overdue_invoice_reminder", debtId: "debt_1", daysOverdue: 7 },
    ]);
  });

  it("creates low stock rules at or below alert level", () => {
    const rules = findLowStockRules([
      { id: "item_1", quantityOnHand: 5, lowStockLevel: 5 },
      { id: "item_2", quantityOnHand: 8, lowStockLevel: 5 },
    ] as never);

    expect(rules).toEqual([
      { type: "low_stock_alert", itemId: "item_1", quantityOnHand: 5, lowStockLevel: 5 },
    ]);
  });
});
