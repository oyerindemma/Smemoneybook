import { randomUUID } from "node:crypto";
import { Prisma, SubscriptionStatus } from "@prisma/client";
import {
  getBillingPlan,
  getBillingPlanByDbPlan,
  type BillingFeature,
  type BillingPlanId,
} from "@/lib/billing/plans";
import type { PaystackVerifyData } from "@/lib/billing/paystack";
import { getPrisma } from "@/lib/prisma";

const planRank: Record<BillingPlanId, number> = {
  starter: 1,
  growth: 2,
  pro: 3,
};

export function createPaymentReference(planId: string) {
  return `sme_${planId}_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export async function createPendingPaystackSubscription({
  userId,
  businessId,
  planId,
  reference,
  authorizationUrl,
  accessCode,
}: {
  userId: string;
  businessId: string;
  planId: string;
  reference: string;
  authorizationUrl: string;
  accessCode: string;
}) {
  const plan = getBillingPlan(planId);

  if (!plan) {
    throw new Error("Unknown billing plan.");
  }

  return getPrisma().subscription.create({
    data: {
      userId,
      businessId,
      plan: plan.dbPlan,
      status: SubscriptionStatus.TRIALING,
      amount: plan.amount,
      amountMonthlyKobo: plan.amountKobo,
      provider: "paystack",
      providerSessionId: reference,
      reference,
      paystackAccessCode: accessCode,
      paystackCheckoutUrl: authorizationUrl,
    },
  });
}

export async function activatePaystackSubscription({
  reference,
  eventType,
  payload,
  actorId,
}: {
  reference: string;
  eventType: string;
  payload: PaystackVerifyData | Record<string, unknown>;
  actorId?: string;
}) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.findUnique({
      where: { reference },
      include: { business: true },
    });

    if (!subscription) {
      throw new Error("Payment reference was not created by SME Moneybook.");
    }

    const plan = getBillingPlanByDbPlan(subscription.plan);
    const amount = Number((payload as PaystackVerifyData).amount ?? 0);
    const status = String((payload as PaystackVerifyData).status ?? "");
    const currency = String((payload as PaystackVerifyData).currency ?? "NGN");

    if (!plan || amount !== plan.amountKobo || status !== "success" || currency !== "NGN") {
      throw new Error("Payment verification failed.");
    }

    const existingEvent = await tx.paymentEvent.findUnique({ where: { reference } });

    if (existingEvent) {
      if (eventType === "charge.success" && existingEvent.eventType !== "charge.success") {
        await tx.paymentEvent.update({
          where: { reference },
          data: {
            eventType,
            payload: payload as Prisma.InputJsonValue,
            processedAt: new Date(),
          },
        });
      }

      return {
        alreadyProcessed: true,
        subscription,
        plan,
      };
    }

    const paidAtValue = (payload as PaystackVerifyData).paid_at;
    const paidAt = paidAtValue ? new Date(paidAtValue) : new Date();

    await tx.paymentEvent.create({
      data: {
        reference,
        eventType,
        payload: payload as Prisma.InputJsonValue,
      },
    });

    const activated = await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        paidAt,
        currentPeriodEnd: new Date(paidAt.getTime() + 30 * 24 * 60 * 60 * 1000),
        providerSessionId: reference,
      },
    });

    await tx.auditLog.create({
      data: {
        businessId: subscription.businessId,
        actorId: actorId ?? subscription.userId,
        action: "billing.subscription_activated",
        message: `${plan.name} subscription was activated via Paystack.`,
        metadata: {
          reference,
          eventType,
          amount: plan.amount,
        },
      },
    });

    return {
      alreadyProcessed: false,
      subscription: activated,
      plan,
    };
  });
}

export async function getActiveSubscription(userId: string, businessId: string) {
  return getPrisma().subscription.findFirst({
    where: {
      userId,
      businessId,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: { gt: new Date() },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getActiveBillingPlan(userId: string, businessId: string) {
  const subscription = await getActiveSubscription(userId, businessId);
  return subscription ? getBillingPlanByDbPlan(subscription.plan) : null;
}

export async function hasMinimumPlan(
  userId: string,
  businessId: string,
  requiredPlan: BillingPlanId,
) {
  const plan = await getActiveBillingPlan(userId, businessId);

  if (!plan) {
    return false;
  }

  return planRank[plan.id] >= planRank[requiredPlan];
}

export async function hasAnyMinimumPlan(userId: string, requiredPlan: BillingPlanId) {
  const subscriptions = await getPrisma().subscription.findMany({
    where: {
      userId,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: { gt: new Date() },
    },
  });

  return subscriptions.some((subscription) => {
    const plan = getBillingPlanByDbPlan(subscription.plan);
    return Boolean(plan && planRank[plan.id] >= planRank[requiredPlan]);
  });
}

export async function requireMinimumPlan(
  userId: string,
  businessId: string,
  requiredPlan: BillingPlanId,
  message = `Upgrade to ${requiredPlan} to use this feature.`,
) {
  if (await hasMinimumPlan(userId, businessId, requiredPlan)) {
    return null;
  }

  return Response.json(
    {
      error: message,
      requiredPlan,
    },
    { status: 402 },
  );
}

export async function requireFeatureAccess(userId: string, businessId: string, feature: BillingFeature) {
  const plan = await getActiveBillingPlan(userId, businessId);

  if (!plan?.features.includes(feature)) {
    return Response.json(
      {
        error: "Upgrade your plan to use this feature.",
      },
      { status: 402 },
    );
  }

  return null;
}

export async function getBillingOverview(userId: string, businessId: string) {
  const subscriptions = await getPrisma().subscription.findMany({
    where: { userId, businessId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const active = subscriptions.find(
    (subscription) =>
      subscription.status === SubscriptionStatus.ACTIVE &&
      (!subscription.currentPeriodEnd || subscription.currentPeriodEnd > new Date()),
  );

  return {
    active,
    history: subscriptions,
  };
}
