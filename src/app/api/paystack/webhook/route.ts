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
    customer?: {
      email?: string;
      customer_code?: string;
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

    const payload = parseWebhookPayload(rawBody);
    if (!payload) {
      return jsonError("Invalid Paystack webhook payload.", 400);
    }

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
    });

    return Response.json({
      ok: true,
      alreadyProcessed: result.alreadyProcessed,
    });
  } catch (error) {
    console.error(
      "paystack.webhook_failed",
      error instanceof Error ? error.message : "Unknown webhook failure.",
    );
    return jsonErrorFromUnknown(error, "Could not process Paystack webhook.");
  }
}

function parseWebhookPayload(rawBody: string): PaystackWebhookPayload | null {
  try {
    const payload = JSON.parse(rawBody) as unknown;
    return typeof payload === "object" && payload !== null && !Array.isArray(payload)
      ? payload as PaystackWebhookPayload
      : null;
  } catch {
    return null;
  }
}
