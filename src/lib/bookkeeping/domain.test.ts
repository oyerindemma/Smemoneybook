import { describe, expect, it } from "vitest";
import {
  buildDuplicateFingerprint,
  createDebtCollectionMovement,
  createMoneyMovement,
  createReversalMovement,
} from "@/lib/bookkeeping/domain";
import {
  createDefaultBusiness,
  recordTransaction,
} from "@/lib/bookkeeping/transaction-engine";

describe("money domain", () => {
  it("increases balance and calculates profit for a paid sale", () => {
    const movement = createMoneyMovement({
      idempotencyKey: "sale-1",
      type: "sale",
      amount: 10_000,
      costOfGoods: 6_500,
      accountId: "cash",
      description: "Shirt sale",
      paymentStatus: "paid",
    });

    expect(movement.accountDelta).toBe(10_000);
    expect(movement.transaction.profit).toBe(3_500);
    expect(movement.debt).toBeUndefined();
  });

  it("creates customer debt without increasing balance for a credit sale", () => {
    const movement = createMoneyMovement({
      idempotencyKey: "sale-credit-1",
      type: "sale",
      amount: 25_000,
      accountId: "bank",
      description: "Customer credit",
      paymentStatus: "credit",
    });

    expect(movement.accountDelta).toBe(0);
    expect(movement.debt).toEqual({
      type: "customer_owes_business",
      amount: 25_000,
    });
  });

  it("decreases balance for a paid expense", () => {
    const movement = createMoneyMovement({
      idempotencyKey: "expense-1",
      type: "expense",
      amount: 4_000,
      accountId: "pos",
      description: "Fuel",
      paymentStatus: "paid",
    });

    expect(movement.accountDelta).toBe(-4_000);
    expect(movement.transaction.profit).toBe(0);
  });

  it("creates supplier debt without decreasing balance for an unpaid expense", () => {
    const movement = createMoneyMovement({
      idempotencyKey: "expense-unpaid-1",
      type: "expense",
      amount: 12_500,
      accountId: "cash",
      description: "Supplier bill",
      paymentStatus: "unpaid",
    });

    expect(movement.accountDelta).toBe(0);
    expect(movement.debt).toEqual({
      type: "business_owes_supplier",
      amount: 12_500,
    });
  });

  it("rejects invalid status combinations", () => {
    expect(() =>
      createMoneyMovement({
        idempotencyKey: "bad-1",
        type: "sale",
        amount: 1_000,
        accountId: "cash",
        description: "Bad sale",
        paymentStatus: "unpaid",
      }),
    ).toThrow("Sales are either paid now or customer credit.");
  });

  it("records debt collections as paid money in", () => {
    const movement = createDebtCollectionMovement(7_500);

    expect(movement.accountDelta).toBe(7_500);
    expect(movement.transaction.type).toBe("sale");
    expect(movement.transaction.paymentStatus).toBe("paid");
  });

  it("moves money between two accounts without creating income or expense", () => {
    const movement = createMoneyMovement({
      idempotencyKey: "transfer-1",
      type: "transfer",
      amount: 50_000,
      accountId: "cash",
      destinationAccountId: "bank",
      description: "Cash deposit",
      paymentStatus: "paid",
    });

    expect(movement.accountDelta).toBe(-50_000);
    expect(movement.destinationAccountDelta).toBe(50_000);
    expect(movement.debt).toBeUndefined();
  });

  it("creates correction movement that reverses a paid sale", () => {
    const movement = createReversalMovement({
      type: "sale",
      amount: 15_000,
      profit: 6_000,
      paymentStatus: "paid",
      description: "Wrong sale",
      accountId: "cash",
    });

    expect(movement.transaction.type).toBe("adjustment");
    expect(movement.accountDelta).toBe(-15_000);
    expect(movement.transaction.profit).toBe(-6_000);
  });

  it("creates stable duplicate fingerprints by minute", () => {
    const input = {
      idempotencyKey: "ui-1",
      type: "expense" as const,
      amount: 3_000,
      accountId: "cash",
      description: "Fuel",
      paymentStatus: "paid" as const,
      category: "Fuel",
    };

    expect(buildDuplicateFingerprint(input, new Date("2026-04-30T10:20:15Z"))).toBe(
      buildDuplicateFingerprint(input, new Date("2026-04-30T10:20:55Z")),
    );
  });

  it("treats duplicate idempotency keys as already applied", () => {
    const state = createDefaultBusiness("Demo Store");
    const firstRecord = recordTransaction(state, {
      idempotencyKey: "ui-repeat",
      type: "sale",
      amount: 10_000,
      accountId: "cash",
      description: "Walk-in sale",
      paymentStatus: "paid",
    });

    const repeatedRecord = recordTransaction(firstRecord, {
      idempotencyKey: "ui-repeat",
      type: "sale",
      amount: 10_000,
      accountId: "cash",
      description: "Walk-in sale",
      paymentStatus: "paid",
    });

    expect(repeatedRecord).toBe(firstRecord);
    expect(repeatedRecord.transactions).toHaveLength(1);
    expect(repeatedRecord.accounts.find((account) => account.id === "cash")?.balance).toBe(
      135_000,
    );
  });
});
