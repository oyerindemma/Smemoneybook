import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { billingCheckoutRequestSchema, parseJsonBody } from "@/lib/api/validation";
import { getPaystackEnv } from "@/lib/billing/env";
import { getBillingPlan } from "@/lib/billing/plans";
import { initializePaystackTransaction } from "@/lib/billing/paystack";
import {
  createPaymentReference,
  createPendingPaystackSubscription,
} from "@/lib/billing/subscriptions";
import { requireBusinessAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const limited = await enforceRateLimit(request, "paystack.initialize", 10, 10 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const user = await requireUser();
    const body = await parseJsonBody(request, billingCheckoutRequestSchema);
    const access = await requireBusinessAccess(user.id, "admin", body.businessId);
    const plan = getBillingPlan(body.plan);

    if (!plan) {
      return jsonError("Choose a valid billing plan.");
    }

    const env = getPaystackEnv();
    const reference = createPaymentReference(plan.id);
    const callbackUrl = `${env.appUrl}/payment/success?reference=${encodeURIComponent(reference)}`;
    const checkout = await initializePaystackTransaction({
      secretKey: env.secretKey,
      email: user.email,
      amountKobo: plan.amountKobo,
      reference,
      callbackUrl,
      metadata: {
        userId: user.id,
        businessId: access.businessId,
        planId: plan.id,
      },
    });

    await createPendingPaystackSubscription({
      userId: user.id,
      businessId: access.businessId,
      planId: plan.id,
      reference,
      authorizationUrl: checkout.authorization_url,
      accessCode: checkout.access_code,
    });

    await getPrisma().auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: user.id,
        action: "billing.paystack_initialized",
        message: `${plan.name} checkout was initialized.`,
        metadata: { reference, plan: plan.id, amount: plan.amount },
      },
    });

    return Response.json({
      authorization_url: checkout.authorization_url,
      reference,
      message: "Redirecting to secure payment...",
    });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not start secure payment.");
  }
}
