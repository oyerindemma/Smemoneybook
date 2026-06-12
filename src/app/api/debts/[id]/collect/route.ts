import { after } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { collectDebtRequestSchema, parseJsonBody } from "@/lib/api/validation";
import { collectDebtForUser } from "@/lib/bookkeeping/persistence";
import { hasMinimumPlan } from "@/lib/billing/subscriptions";
import { sendPaymentConfirmationForCollection } from "@/server/whatsapp/payment-confirmation";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(request, collectDebtRequestSchema);
    const limited = await enforceRateLimit(request, "debts.collect.write", 120, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const state = await collectDebtForUser({
      userId: user.id,
      businessId: body.businessId,
      debtId: id,
      accountId: body.accountId,
      idempotencyKey: body.idempotencyKey || crypto.randomUUID(),
      amount: body.amount,
    });

    if (await hasMinimumPlan(user.id, body.businessId, "growth")) {
      after(async () => {
        try {
          await sendPaymentConfirmationForCollection({
            userId: user.id,
            businessId: body.businessId,
            debtId: id,
          });
        } catch (error) {
          console.error("whatsapp.payment_confirmation_failed", error);
        }
      });
    }

    return Response.json({ state });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not collect this money.");
  }
}
