import { describe, expect, it } from "vitest";
import { detectPredictiveAlerts } from "@/lib/phase3/predictive-alerts";

const generatedAt = new Date("2026-07-20T12:00:00.000Z");

describe("Phase 3O predictive alerts", () => {
  it("detects a revenue drop with source metrics", () => {
    const alerts = detectPredictiveAlerts({
      businessId: "biz_1",
      generatedAt,
      transactions: [
        sale("sale_1", 5_000, "2026-07-10"),
        sale("sale_2", 6_000, "2026-07-11"),
        sale("sale_3", 20_000, "2026-06-28"),
        sale("sale_4", 20_000, "2026-06-29"),
      ],
      debts: [],
      inventoryItems: [],
      inventoryMovements: [],
      returns: [],
    });

    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "revenue_drop",
          severity: "critical",
          sourceMetrics: expect.objectContaining({
            currentRevenue: 11_000,
            previousRevenue: 40_000,
          }),
        }),
      ]),
    );
  });

  it("does not create trend alerts without enough samples", () => {
    const alerts = detectPredictiveAlerts({
      businessId: "biz_1",
      generatedAt,
      transactions: [
        sale("sale_1", 1_000, "2026-07-10"),
        sale("sale_2", 50_000, "2026-06-28"),
      ],
      debts: [],
      inventoryItems: [],
      inventoryMovements: [],
      returns: [],
    });

    expect(alerts.some((alert) => alert.type === "revenue_drop")).toBe(false);
  });

  it("detects duplicate transactions and avoids fraud language", () => {
    const alerts = detectPredictiveAlerts({
      businessId: "biz_1",
      generatedAt,
      transactions: [
        sale("sale_1", 10_000, "2026-07-18", "Market sale"),
        sale("sale_2", 10_000, "2026-07-18", "Market sale"),
      ],
      debts: [],
      inventoryItems: [],
      inventoryMovements: [],
      returns: [],
    });
    const duplicate = alerts.find((alert) => alert.type === "duplicate_transaction");

    expect(duplicate).toBeTruthy();
    expect(`${duplicate?.explanation} ${duplicate?.recommendedAction}`.toLowerCase()).not.toContain("fraud");
  });

  it("turns a negative cashflow forecast into a cash shortage alert", () => {
    const alerts = detectPredictiveAlerts({
      businessId: "biz_1",
      generatedAt,
      transactions: [],
      debts: [],
      inventoryItems: [],
      inventoryMovements: [],
      returns: [],
      cashflowForecasts: [
        {
          id: "forecast_1",
          horizonDays: 30,
          confidence: "medium",
          forecastEndingCash: -15_000,
          lowerBound: -25_000,
          forecastStart: new Date("2026-07-21T00:00:00.000Z"),
          forecastEnd: new Date("2026-08-20T00:00:00.000Z"),
          generatedAt,
        },
      ],
    });

    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "potential_cash_shortage",
          severity: "critical",
          impactAmount: 25_000,
        }),
      ]),
    );
  });
});

function sale(id: string, amount: number, date: string, description = "Sale") {
  return {
    id,
    accountId: "account_1",
    type: "SALE",
    amount,
    description,
    occurredAt: new Date(`${date}T10:00:00.000Z`),
  };
}
