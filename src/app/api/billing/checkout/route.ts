import { SubscriptionPlan } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { billingCheckoutRequestSchema, parseJsonBody } from "@/lib/api/validation";
import { requireBusinessAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

const plans = {
  starter: { dbPlan: SubscriptionPlan.STARTER, amountMonthlyKobo: 300000 },
  growth: { dbPlan: SubscriptionPlan.GROWTH, amountMonthlyKobo: 600000 },
  pro: { dbPlan: SubscriptionPlan.PRO, amountMonthlyKobo: 1000000 },
} as const;

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await parseJsonBody(request, billingCheckoutRequestSchema);
    const access = await requireBusinessAccess(user.id, "admin", body.businessId);
    const plan = plans[body.plan];
    const subscription = await getPrisma().subscription.create({
      data: {
        businessId: access.businessId,
        plan: plan.dbPlan,
        amountMonthlyKobo: plan.amountMonthlyKobo,
        provider: process.env.PAYSTACK_SECRET_KEY ? "paystack_ready" : "manual",
        currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });

    await getPrisma().auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: user.id,
        action: "billing.checkout_started",
        message: `${body.plan} plan checkout was prepared.`,
      },
    });

    return Response.json({
      subscriptionId: subscription.id,
      plan: body.plan,
      amountMonthly: plan.amountMonthlyKobo / 100,
      checkoutUrl: process.env.PAYSTACK_SECRET_KEY ? null : "/billing/manual-review",
      message: process.env.PAYSTACK_SECRET_KEY
        ? "Payment provider is configured for checkout handoff."
        : "Manual billing record created. Connect Paystack or Stripe keys before live charging.",
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not start billing checkout.");
  }
}
