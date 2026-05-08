import { isPaystackConfigured } from "@/lib/billing/env";

export const runtime = "nodejs";

export async function GET() {
  const billingLive = isPaystackConfigured();

  return Response.json({
    billingLive,
    provider: billingLive ? "paystack" : null,
    message: billingLive
      ? "Secure billing is available."
      : "Billing is not available yet.",
  });
}
