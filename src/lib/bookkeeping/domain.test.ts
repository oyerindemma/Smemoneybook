import { describe, expect, it } from "vitest";
import {
  createDebtCollectionMovement,
  createMoneyMovement,
} from "@/lib/bookkeeping/domain";

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
});
