import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const recordPersistentTransaction = vi.fn();
const getDashboardStateForUser = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireUser,
}));

vi.mock("@/lib/bookkeeping/persistence", () => ({
  getDashboardStateForUser,
  recordPersistentTransaction,
}));

describe("/api/transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user_1", name: "Owner", email: "owner@test.ng" });
    recordPersistentTransaction.mockResolvedValue({ businessName: "Demo", accounts: [] });
  });

  it("rejects invalid transaction payloads before persistence", async () => {
    const { POST } = await import("@/app/api/transactions/route");
    const response = await POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          type: "sale",
          amount: 0,
          accountId: "cash",
          paymentStatus: "paid",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(recordPersistentTransaction).not.toHaveBeenCalled();
  });

  it("passes validated transaction input to the money service", async () => {
    const { POST } = await import("@/app/api/transactions/route");
    const response = await POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: "ui-1",
          businessId: "biz_1",
          type: "sale",
          amount: "15000",
          accountId: "cash",
          description: "Walk-in sale",
          paymentStatus: "paid",
          costOfGoods: "9000",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(recordPersistentTransaction).toHaveBeenCalledWith({
      userId: "user_1",
      businessId: "biz_1",
      input: {
        idempotencyKey: "ui-1",
        type: "sale",
        amount: 15_000,
        accountId: "cash",
        destinationAccountId: undefined,
        description: "Walk-in sale",
        category: undefined,
        paymentStatus: "paid",
        partyName: undefined,
        partyPhone: undefined,
        inventoryItemId: undefined,
        inventoryQuantity: undefined,
        costOfGoods: 9_000,
        occurredAt: undefined,
        dueAt: undefined,
      },
    });
  });

  it("accepts transfers with a destination account", async () => {
    const { POST } = await import("@/app/api/transactions/route");
    const response = await POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: "transfer-1",
          businessId: "biz_1",
          type: "transfer",
          amount: "20000",
          accountId: "cash",
          destinationAccountId: "bank",
          description: "Bank deposit",
          paymentStatus: "paid",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(recordPersistentTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          type: "transfer",
          accountId: "cash",
          destinationAccountId: "bank",
        }),
      }),
    );
  });

  it("accepts product sale metadata", async () => {
    const { POST } = await import("@/app/api/transactions/route");
    const response = await POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: "product-sale-1",
          businessId: "biz_1",
          type: "sale",
          amount: "36000",
          accountId: "cash",
          description: "Ankara shirt sale",
          paymentStatus: "paid",
          inventoryItemId: "item_1",
          inventoryQuantity: "2",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(recordPersistentTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          inventoryItemId: "item_1",
          inventoryQuantity: 2,
        }),
      }),
    );
  });
});
