import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { getPaystackEnv } from "@/lib/billing/env";
import { verifyPaystackSignature } from "@/lib/billing/paystack";
import { activatePaystackSubscription } from "@/lib/billing/subscriptions";

export const runtime = "nodejs";

type PaystackWebhookPayload = {
  event?: string;
  data?: {
    reference?: string;
    status?: string;
    amount?: number;
    currency?: string;
    paid_at?: string | null;
    metadata?: {
      userId?: string;
      businessId?: string;
      planId?: string;
    };
  };
};

export async function POST(request: Request) {
  try {
    const env = getPaystackEnv();
    const rawBody = await request.text();
    const signature = request.headers.get("x-paystack-signature");

    if (!verifyPaystackSignature(rawBody, signature, env.secretKey)) {
      return jsonError("Invalid Paystack signature.", 401);
    }

    const payload = JSON.parse(rawBody) as PaystackWebhookPayload;

    if (payload.event !== "charge.success") {
      return Response.json({ ok: true, ignored: true });
    }

    const reference = payload.data?.reference?.trim();

    if (!reference) {
      return jsonError("Webhook reference is missing.");
    }

    const result = await activatePaystackSubscription({
      reference,
      eventType: payload.event,
      payload: payload.data ?? {},
      actorId: payload.data?.metadata?.userId,
    });

    return Response.json({
      ok: true,
      alreadyProcessed: result.alreadyProcessed,
    });
  } catch (error) {
    console.error(error);
    return jsonErrorFromUnknown(error, "Could not process Paystack webhook.");
  }
}
