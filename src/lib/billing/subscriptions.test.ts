import { beforeEach, describe, expect, it, vi } from "vitest";
import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

const subscriptionFindUnique = vi.fn();
const paymentEventFindUnique = vi.fn();
const paymentEventCreate = vi.fn();
const paymentEventUpdate = vi.fn();
const subscriptionUpdate = vi.fn();
const auditLogCreate = vi.fn();
const transaction = vi.fn((callback) =>
  callback({
    subscription: {
      findUnique: subscriptionFindUnique,
      update: subscriptionUpdate,
    },
    paymentEvent: {
      findUnique: paymentEventFindUnique,
      create: paymentEventCreate,
      update: paymentEventUpdate,
    },
    auditLog: {
      create: auditLogCreate,
    },
  }),
);

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    $transaction: transaction,
  }),
}));

describe("billing subscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subscriptionFindUnique.mockResolvedValue({
      id: "sub_1",
      userId: "user_1",
      businessId: "biz_1",
      plan: SubscriptionPlan.STARTER,
      status: SubscriptionStatus.TRIALING,
      reference: "sme_starter_ref",
    });
    paymentEventFindUnique.mockResolvedValue(null);
    subscriptionUpdate.mockResolvedValue({
      id: "sub_1",
      status: SubscriptionStatus.ACTIVE,
    });
  });

  it("activates a matching successful Paystack payment once", async () => {
    const { activatePaystackSubscription } = await import("@/lib/billing/subscriptions");

    const result = await activatePaystackSubscription({
      reference: "sme_starter_ref",
      eventType: "charge.success",
      payload: {
        reference: "sme_starter_ref",
        status: "success",
        amount: 350000,
        currency: "NGN",
        paid_at: "2026-06-12T00:00:00.000Z",
      },
    });

    expect(result.alreadyProcessed).toBe(false);
    expect(paymentEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reference: "sme_starter_ref",
        eventType: "charge.success",
      }),
    });
    expect(subscriptionUpdate).toHaveBeenCalledWith({
      where: { id: "sub_1" },
      data: expect.objectContaining({
        status: SubscriptionStatus.ACTIVE,
        providerSessionId: "sme_starter_ref",
      }),
    });
    expect(auditLogCreate).toHaveBeenCalled();
  });

  it("rejects wrong amount, status, or currency", async () => {
    const { activatePaystackSubscription } = await import("@/lib/billing/subscriptions");

    await expect(
      activatePaystackSubscription({
        reference: "sme_starter_ref",
        eventType: "charge.success",
        payload: {
          reference: "sme_starter_ref",
          status: "success",
          amount: 1200000,
          currency: "NGN",
        },
      }),
    ).rejects.toThrow("Payment verification failed.");

    expect(paymentEventCreate).not.toHaveBeenCalled();
    expect(subscriptionUpdate).not.toHaveBeenCalled();
  });

  it("does not process duplicate Paystack events twice", async () => {
    paymentEventFindUnique.mockResolvedValueOnce({
      reference: "sme_starter_ref",
      eventType: "charge.success",
    });
    const { activatePaystackSubscription } = await import("@/lib/billing/subscriptions");

    const result = await activatePaystackSubscription({
      reference: "sme_starter_ref",
      eventType: "charge.success",
      payload: {
        reference: "sme_starter_ref",
        status: "success",
        amount: 350000,
        currency: "NGN",
      },
    });

    expect(result.alreadyProcessed).toBe(true);
    expect(paymentEventCreate).not.toHaveBeenCalled();
    expect(subscriptionUpdate).not.toHaveBeenCalled();
  });
});
