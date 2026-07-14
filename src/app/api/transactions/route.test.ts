import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const enforceRateLimit = vi.fn();
const recordPersistentTransaction = vi.fn();
const getDashboardStateForUser = vi.fn();
const requireBusinessAccess = vi.fn();
const requireTransactionAllowance = vi.fn();
const requirePeopleAllowance = vi.fn();
const willCreateBillablePerson = vi.fn();
const activateReferralRewards = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireUser,
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  enforceRateLimit,
}));

vi.mock("@/lib/bookkeeping/persistence", () => ({
  getDashboardStateForUser,
  recordPersistentTransaction,
}));

vi.mock("@/lib/operations/access", () => ({
  requireBusinessAccess,
}));

vi.mock("@/lib/billing/free-limits", () => ({
  requireTransactionAllowance,
  requirePeopleAllowance,
  willCreateBillablePerson,
}));

vi.mock("@/lib/viral/referral-service", () => ({
  activateReferralRewards,
}));

describe("/api/transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user_1", name: "Owner", email: "owner@test.ng" });
    enforceRateLimit.mockResolvedValue(null);
    recordPersistentTransaction.mockResolvedValue({ businessName: "Demo", accounts: [] });
    requireBusinessAccess.mockResolvedValue({ businessId: "biz_1" });
    requireTransactionAllowance.mockResolvedValue(null);
    requirePeopleAllowance.mockResolvedValue(null);
    willCreateBillablePerson.mockReturnValue(false);
    activateReferralRewards.mockResolvedValue(null);
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
        invoiceItems: undefined,
        costOfGoods: 9_000,
        occurredAt: undefined,
        dueAt: undefined,
      },
    });
    expect(activateReferralRewards).toHaveBeenCalledWith({ referredUserId: "user_1" });
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

  it("accepts multi-product invoice metadata", async () => {
    const { POST } = await import("@/app/api/transactions/route");
    const response = await POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: "multi-product-sale-1",
          businessId: "biz_1",
          type: "sale",
          amount: "54000",
          accountId: "cash",
          description: "Invoice for Amina Stores",
          paymentStatus: "credit",
          partyName: "Amina Stores",
          invoiceItems: [
            { inventoryItemId: "item_1", quantity: "2" },
            { inventoryItemId: "item_2", quantity: 1 },
          ],
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(recordPersistentTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          invoiceItems: [
            { inventoryItemId: "item_1", quantity: 2 },
            { inventoryItemId: "item_2", quantity: 1 },
          ],
        }),
      }),
    );
  });

  it("returns the Starter paywall when the free record limit is reached", async () => {
    requireTransactionAllowance.mockResolvedValue(
      Response.json({ error: "Upgrade to Starter.", requiredPlan: "starter" }, { status: 402 }),
    );
    const { POST } = await import("@/app/api/transactions/route");
    const response = await POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: "limit-1",
          businessId: "biz_1",
          type: "sale",
          amount: "15000",
          accountId: "cash",
          description: "Walk-in sale",
          paymentStatus: "paid",
          costOfGoods: "0",
        }),
      }),
    );

    expect(response.status).toBe(402);
    expect(recordPersistentTransaction).not.toHaveBeenCalled();
  });

  it("returns the Starter paywall when a free credit sale would add too many people", async () => {
    willCreateBillablePerson.mockReturnValue(true);
    requirePeopleAllowance.mockResolvedValue(
      Response.json({ error: "Upgrade to Starter.", requiredPlan: "starter" }, { status: 402 }),
    );
    const { POST } = await import("@/app/api/transactions/route");
    const response = await POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: "people-limit-1",
          businessId: "biz_1",
          type: "sale",
          amount: "15000",
          accountId: "cash",
          description: "Credit sale",
          partyName: "Ada",
          paymentStatus: "credit",
        }),
      }),
    );

    expect(response.status).toBe(402);
    expect(recordPersistentTransaction).not.toHaveBeenCalled();
  });

  it("rate limits repeated money writes", async () => {
    enforceRateLimit.mockResolvedValueOnce(
      Response.json({ error: "Too many attempts." }, { status: 429 }),
    );
    const { POST } = await import("@/app/api/transactions/route");
    const response = await POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: "rate-limit-1",
          businessId: "biz_1",
          type: "sale",
          amount: "15000",
          accountId: "cash",
          description: "Walk-in sale",
          paymentStatus: "paid",
        }),
      }),
    );

    expect(response.status).toBe(429);
    expect(recordPersistentTransaction).not.toHaveBeenCalled();
  });
});
