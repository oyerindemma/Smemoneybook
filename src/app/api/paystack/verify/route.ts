import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { getPaystackEnv } from "@/lib/billing/env";
import { verifyPaystackTransaction } from "@/lib/billing/paystack";
import { activatePaystackSubscription } from "@/lib/billing/subscriptions";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function verifyReference(request: Request) {
  const user = await requireUser();
  const reference = new URL(request.url).searchParams.get("reference")?.trim();

  if (!reference) {
    return jsonError("Payment reference is required.");
  }

  const subscription = await getPrisma().subscription.findUnique({ where: { reference } });

  if (!subscription || subscription.userId !== user.id) {
    return jsonError("Payment reference was not found.", 404);
  }

  const env = getPaystackEnv();
  const payment = await verifyPaystackTransaction(env.secretKey, reference);
  const result = await activatePaystackSubscription({
    reference,
    eventType: "transaction.verify",
    payload: payment,
    actorId: user.id,
  });

  return Response.json({
    success: true,
    alreadyProcessed: result.alreadyProcessed,
    plan: {
      id: result.plan.id,
      name: result.plan.name,
      amount: result.plan.amount,
    },
    status: result.subscription.status,
    message: "Payment verified. Subscription activated.",
  });
}

export async function GET(request: Request) {
  try {
    const limited = await enforceRateLimit(request, "paystack.verify", 20, 10 * 60 * 1000);

    if (limited) {
      return limited;
    }

    return verifyReference(request);
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Payment verification failed.");
  }
}
