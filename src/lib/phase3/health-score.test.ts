import { describe, expect, it } from "vitest";
import { calculateBusinessHealthScore } from "@/lib/phase3/health-score";

const baseDate = new Date("2026-07-19T06:00:00.000Z");

describe("Phase 3C business health score", () => {
  it("returns transparent components and source metrics", () => {
    const score = calculateBusinessHealthScore({
      businessId: "biz_1",
      businessCreatedAt: new Date("2025-01-01T00:00:00.000Z"),
      periodStart: new Date("2026-06-19T00:00:00.000Z"),
      periodEnd: baseDate,
      previousPeriodStart: new Date("2026-05-20T00:00:00.000Z"),
      previousPeriodEnd: new Date("2026-06-19T00:00:00.000Z"),
      generatedAt: baseDate,
      transactions: [
        sale("2026-07-01", 100_000, 50_000),
        sale("2026-07-02", 120_000, 60_000),
        sale("2026-07-03", 90_000, 45_000),
        sale("2026-07-04", 80_000, 40_000),
        sale("2026-07-05", 110_000, 55_000),
        expense("2026-07-05", 100_000),
        sale("2026-06-01", 50_000, 25_000),
        sale("2026-06-02", 60_000, 30_000),
        sale("2026-06-03", 55_000, 27_000),
        sale("2026-06-04", 65_000, 32_000),
        sale("2026-06-05", 70_000, 35_000),
      ],
      debts: [
        {
          type: "customer_owes_business",
          amount: 30_000,
          paidAmount: 10_000,
          status: "open",
          dueAt: new Date("2026-07-01T00:00:00.000Z"),
        },
      ],
      accounts: [{ balance: 500_000 }],
      inventoryItems: [
        { quantityOnHand: 15, lowStockLevel: 5, costPrice: 2_000 },
        { quantityOnHand: 2, lowStockLevel: 5, costPrice: 1_000 },
      ],
    });

    expect(score.formulaVersion).toBe("health-score-v1");
    expect(score.components).toHaveLength(9);
    expect(score.sourceMetrics.currentSales).toBe(500_000);
    expect(score.components.find((component) => component.id === "customer_debt_ageing")).toMatchObject({
      status: "attention",
      trend: "declined",
    });
    expect(score.recommendations.length).toBeGreaterThan(0);
  });

  it("does not punish very new businesses with strong negative trend claims", () => {
    const score = calculateBusinessHealthScore({
      businessId: "biz_new",
      businessCreatedAt: new Date("2026-07-15T00:00:00.000Z"),
      periodStart: new Date("2026-06-19T00:00:00.000Z"),
      periodEnd: baseDate,
      previousPeriodStart: new Date("2026-05-20T00:00:00.000Z"),
      previousPeriodEnd: new Date("2026-06-19T00:00:00.000Z"),
      generatedAt: baseDate,
      transactions: [sale("2026-07-18", 10_000, 5_000)],
      debts: [],
      accounts: [{ balance: 20_000 }],
      inventoryItems: [],
    });

    expect(score.confidence).toBe("low");
    expect(score.dataWarnings.join(" ")).toMatch(/New business/i);
    expect(score.components.find((component) => component.id === "recording_consistency")).toMatchObject({
      status: "insufficient_data",
    });
  });
});

function sale(date: string, amount: number, profit: number) {
  return {
    type: "sale",
    amount,
    profit,
    paymentStatus: "paid",
    occurredAt: new Date(`${date}T12:00:00.000Z`),
    category: "Sales",
    customerId: "customer_1",
  };
}

function expense(date: string, amount: number) {
  return {
    type: "expense",
    amount,
    profit: 0,
    paymentStatus: "paid",
    occurredAt: new Date(`${date}T12:00:00.000Z`),
    category: "Rent",
    supplierId: "supplier_1",
  };
}
