import { describe, expect, it } from "vitest";
import { buildRetentionEngine } from "@/lib/retention/retention-engine";
import type { MoneybookState } from "@/lib/bookkeeping/transaction-engine";

describe("buildRetentionEngine", () => {
  it("builds streaks, health, reminders, and segment", () => {
    const state: MoneybookState = {
      businessName: "Ada Store",
      accounts: [{ id: "cash", name: "Cash", type: "cash", openingBalance: 0, balance: 50000 }],
      transactions: [
        {
          id: "txn_1",
          idempotencyKey: "1",
          type: "sale",
          amount: 20000,
          accountId: "cash",
          description: "Sale",
          paymentStatus: "paid",
          profit: 20000,
          occurredAt: "2026-05-21T08:00:00.000Z",
        },
        {
          id: "txn_2",
          idempotencyKey: "2",
          type: "sale",
          amount: 10000,
          accountId: "cash",
          description: "Sale",
          paymentStatus: "paid",
          profit: 10000,
          occurredAt: "2026-05-20T08:00:00.000Z",
        },
      ],
      debts: [
        {
          id: "debt_1",
          type: "customer_owes_business",
          partyName: "Amina",
          amount: 5000,
          paidAmount: 0,
          remainingAmount: 5000,
          sourceTransactionId: "txn_3",
          dueAt: "2026-05-20T00:00:00.000Z",
          status: "open",
          isOverdue: true,
          events: [],
        },
      ],
      items: [],
      auditLogs: [],
    };

    const result = buildRetentionEngine(state, new Date("2026-05-21T12:00:00.000Z"));

    expect(result.streak.days).toBe(2);
    expect(result.businessHealth.score).toBeGreaterThan(0);
    expect(result.invoiceReminders[0]).toContain("Amina");
    expect(result.segment).toBe("New");
  });
});
