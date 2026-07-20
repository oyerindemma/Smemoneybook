import { describe, expect, it } from "vitest";
import { calculateExecutiveDashboard } from "@/lib/phase3/executive-dashboard";

describe("Phase 3N executive dashboard", () => {
  it("summarizes owner metrics with clear source counts", () => {
    const dashboard = calculateExecutiveDashboard({
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-08-01T00:00:00.000Z"),
      generatedAt: new Date("2026-07-19T12:00:00.000Z"),
      accounts: [{ balance: 50_000 }, { balance: 25_000 }],
      locations: [{ id: "loc_1", name: "Main shop" }],
      debts: [
        { type: "customer_owes_business", amount: 30_000, paidAmount: 5_000, status: "open" },
        { type: "business_owes_supplier", amount: 20_000, paidAmount: 0, status: "open" },
      ],
      inventoryItems: [
        { id: "item_1", name: "Rice", quantityOnHand: 10, costPrice: 5_000, sellingPrice: 7_000 },
        { id: "item_2", name: "Beans", quantityOnHand: 5, costPrice: 3_000, sellingPrice: 4_500 },
      ],
      transactions: [
        {
          type: "sale",
          amount: 14_000,
          profit: 4_000,
          occurredAt: "2026-07-02T10:00:00.000Z",
          locationId: "loc_1",
          inventoryItemId: "item_1",
          productName: "Rice",
        },
        {
          type: "expense",
          amount: 3_000,
          occurredAt: "2026-07-03T10:00:00.000Z",
          locationId: "loc_1",
        },
      ],
    });

    expect(dashboard.formulaVersion).toBe("executive-dashboard-v1");
    expect(dashboard.summary.revenue).toBe(14_000);
    expect(dashboard.summary.expenses).toBe(3_000);
    expect(dashboard.summary.profit).toBe(1_000);
    expect(dashboard.summary.cashAvailable).toBe(75_000);
    expect(dashboard.summary.outstandingCustomerDebt).toBe(25_000);
    expect(dashboard.summary.supplierBills).toBe(20_000);
    expect(dashboard.summary.stockCostValue).toBe(65_000);
    expect(dashboard.summary.potentialRevenue).toBe(92_500);
    expect(dashboard.summary.grossMarginPercent).toBe(28.57);
    expect(dashboard.summary.bestProducts[0]?.name).toBe("Rice");
    expect(dashboard.summary.slowProducts[0]?.name).toBe("Beans");
    expect(dashboard.sourceMetrics.transactionCount).toBe(2);
  });

  it("recommends action without misleading vanity metrics when data is thin", () => {
    const dashboard = calculateExecutiveDashboard({
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-08-01T00:00:00.000Z"),
      accounts: [],
      locations: [],
      debts: [],
      inventoryItems: [],
      transactions: [],
    });

    expect(dashboard.summary.grossMarginPercent).toBeNull();
    expect(dashboard.recommendedActions).toContain("Record sales for this period before making revenue decisions.");
    expect(dashboard.freshness.latestTransactionAt).toBeNull();
  });
});
