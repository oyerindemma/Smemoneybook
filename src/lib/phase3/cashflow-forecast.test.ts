import { describe, expect, it } from "vitest";
import {
  calculateCashflowForecast,
  type CashflowForecastDebt,
  type CashflowForecastTransaction,
} from "@/lib/phase3/cashflow-forecast";

const now = new Date("2026-07-19T12:00:00.000Z");

describe("calculateCashflowForecast", () => {
  it("builds 7, 30, and 90 day forecasts from recorded cash movements and due debts", () => {
    const forecast = calculateCashflowForecast({
      businessId: "biz_1",
      businessCreatedAt: daysAgo(180),
      periodStart: daysAgo(180),
      recordedThrough: now,
      generatedAt: now,
      accounts: [{ balance: 100_000 }],
      transactions: buildTransactionHistory(150),
      debts: [
        openDebt({
          type: "customer_owes_business",
          amount: 10_000,
          paidAmount: 2_000,
          dueAt: daysFromNow(5),
          customerId: "customer_1",
        }),
        openDebt({
          type: "business_owes_supplier",
          amount: 15_000,
          dueAt: daysFromNow(20),
          supplierId: "supplier_1",
        }),
      ],
    });

    expect(forecast.formulaVersion).toBe("cashflow-forecast-v1");
    expect(forecast.forecasts.map((item) => item.horizonDays)).toEqual([7, 30, 90]);
    expect(forecast.recordedMetrics.paidSales).toBeGreaterThan(0);
    expect(forecast.forecasts[0].expectedCustomerPayments).toBe(8_000);
    expect(forecast.forecasts[1].supplierObligations).toBe(15_000);
    expect(forecast.forecasts[0].confidence).not.toBe("insufficient_data");
    expect(forecast.forecasts[0].backtest.available).toBe(true);
  });

  it("returns conservative insufficient-data forecasts for a new business", () => {
    const forecast = calculateCashflowForecast({
      businessId: "biz_new",
      businessCreatedAt: daysAgo(8),
      periodStart: daysAgo(8),
      recordedThrough: now,
      generatedAt: now,
      accounts: [{ balance: 5_000 }],
      transactions: [
        sale(daysAgo(3), 2_000),
        expense(daysAgo(2), 1_500),
      ],
      debts: [],
    });

    expect(forecast.forecasts.every((item) => item.confidence === "insufficient_data")).toBe(true);
    expect(forecast.forecasts[0].dataWarnings.join(" ")).toContain("Cashflow forecasts are estimates");
    expect(forecast.forecasts[0].assumptions.join(" ")).toContain("building enough history");
  });

  it("raises cash shortage and supplier obligation alerts when cash may go negative", () => {
    const forecast = calculateCashflowForecast({
      businessId: "biz_short",
      businessCreatedAt: daysAgo(120),
      periodStart: daysAgo(120),
      recordedThrough: now,
      generatedAt: now,
      accounts: [{ balance: 2_000 }],
      horizons: [30],
      transactions: [
        ...Array.from({ length: 45 }, (_, index) => sale(daysAgo(index + 1), 300)),
        ...Array.from({ length: 45 }, (_, index) => expense(daysAgo(index + 1), 900)),
      ],
      debts: [
        openDebt({
          type: "business_owes_supplier",
          amount: 25_000,
          dueAt: daysFromNow(10),
          supplierId: "supplier_2",
        }),
      ],
    });

    const [thirtyDayForecast] = forecast.forecasts;
    expect(thirtyDayForecast.forecastEndingCash).toBeLessThan(0);
    expect(thirtyDayForecast.alerts.map((alert) => alert.type)).toContain("expected_cash_shortage");
    expect(thirtyDayForecast.alerts.map((alert) => alert.type)).toContain("large_supplier_obligations");
  });
});

function buildTransactionHistory(days: number): CashflowForecastTransaction[] {
  const transactions: CashflowForecastTransaction[] = [];

  for (let day = days; day >= 1; day -= 1) {
    transactions.push(sale(daysAgo(day), 1_000, `customer_${day % 4}`));
    transactions.push(expense(daysAgo(day), 400));
  }

  return transactions;
}

function sale(date: Date, amount: number, customerId = "customer_1"): CashflowForecastTransaction {
  return {
    type: "sale",
    amount,
    paymentStatus: "paid",
    occurredAt: date,
    customerId,
  };
}

function expense(date: Date, amount: number): CashflowForecastTransaction {
  return {
    type: "expense",
    amount,
    paymentStatus: "paid",
    occurredAt: date,
    category: "Operations",
  };
}

function openDebt(input: {
  type: "customer_owes_business" | "business_owes_supplier";
  amount: number;
  paidAmount?: number;
  dueAt: Date;
  customerId?: string;
  supplierId?: string;
}): CashflowForecastDebt {
  return {
    type: input.type,
    amount: input.amount,
    paidAmount: input.paidAmount ?? 0,
    status: "open",
    dueAt: input.dueAt,
    customerId: input.customerId,
    supplierId: input.supplierId,
  };
}

function daysAgo(days: number) {
  return new Date(now.getTime() - days * 86_400_000);
}

function daysFromNow(days: number) {
  return new Date(now.getTime() + days * 86_400_000);
}
