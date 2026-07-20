import { describe, expect, it } from "vitest";
import {
  calculateLoanReadiness,
  type LoanReadinessTransaction,
} from "@/lib/phase3/loan-readiness";

const now = new Date("2026-07-19T12:00:00.000Z");

describe("calculateLoanReadiness", () => {
  it("scores explainable readiness from recorded business evidence", () => {
    const assessment = calculateLoanReadiness({
      businessId: "biz_1",
      businessCreatedAt: daysAgo(420),
      periodStart: daysAgo(180),
      periodEnd: now,
      generatedAt: now,
      accounts: [{ balance: 300_000 }],
      inventoryItems: [{ quantityOnHand: 40, costPrice: 2_000 }],
      debts: [],
      transactions: [
        ...Array.from({ length: 80 }, (_, index) => sale(daysAgo(index + 1), 5_000, `customer_${index % 8}`)),
        ...Array.from({ length: 40 }, (_, index) => expense(daysAgo(index + 1), 1_000)),
      ],
    });

    expect(assessment.formulaVersion).toBe("loan-readiness-v1");
    expect(assessment.score).toBeGreaterThan(60);
    expect(assessment.confidence).toBe("high");
    expect(assessment.disclaimer).toContain("not loan approval");
    expect(assessment.components.map((component) => component.id)).toContain("record_completeness");
  });

  it("returns insufficient data for thin records", () => {
    const assessment = calculateLoanReadiness({
      businessId: "biz_new",
      businessCreatedAt: daysAgo(20),
      periodStart: daysAgo(20),
      periodEnd: now,
      generatedAt: now,
      accounts: [],
      inventoryItems: [],
      debts: [],
      transactions: [sale(daysAgo(2), 2_000, "customer_1")],
    });

    expect(assessment.confidence).toBe("insufficient_data");
    expect(assessment.rating).toBe("Insufficient data");
    expect(assessment.dataWarnings.join(" ")).toContain("not loan approval");
  });

  it("flags customer concentration as a weakness", () => {
    const assessment = calculateLoanReadiness({
      businessId: "biz_concentrated",
      businessCreatedAt: daysAgo(240),
      periodStart: daysAgo(180),
      periodEnd: now,
      generatedAt: now,
      accounts: [{ balance: 50_000 }],
      inventoryItems: [{ quantityOnHand: 10, costPrice: 1_000 }],
      debts: [],
      transactions: [
        ...Array.from({ length: 20 }, (_, index) => sale(daysAgo(index + 1), 5_000, "customer_big")),
        ...Array.from({ length: 8 }, (_, index) => expense(daysAgo(index + 1), 1_000)),
      ],
    });

    const concentration = assessment.components.find((component) => component.id === "customer_concentration");
    expect(concentration?.status).toBe("weakness");
  });
});

function sale(date: Date, amount: number, customerId: string): LoanReadinessTransaction {
  return {
    type: "sale",
    amount,
    profit: amount * 0.4,
    paymentStatus: "paid",
    occurredAt: date,
    category: "Sales",
    customerId,
  };
}

function expense(date: Date, amount: number): LoanReadinessTransaction {
  return {
    type: "expense",
    amount,
    profit: 0,
    paymentStatus: "paid",
    occurredAt: date,
    category: "Operations",
  };
}

function daysAgo(days: number) {
  return new Date(now.getTime() - days * 86_400_000);
}
