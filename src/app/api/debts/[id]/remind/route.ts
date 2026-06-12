import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { parseJsonBody, remindDebtRequestSchema } from "@/lib/api/validation";
import { remindDebtForUser } from "@/lib/bookkeeping/persistence";
import { requireMinimumPlan } from "@/lib/billing/subscriptions";
import { requireBusinessAccess } from "@/lib/operations/access";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(request, remindDebtRequestSchema);
    const limited = await enforceRateLimit(request, "debts.remind.write", 80, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    if (body.channel !== "manual") {
      const access = await requireBusinessAccess(user.id, "money:write", body.businessId);
      const gated = await requireMinimumPlan(
        user.id,
        access.businessId,
        "growth",
        "Upgrade to Growth to send WhatsApp or SMS reminders.",
      );

      if (gated) {
        return gated;
      }
    }

    const result = await remindDebtForUser({
      userId: user.id,
      businessId: body.businessId,
      debtId: id,
      channel: body.channel,
      note: body.note,
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not note reminder.");
  }
}
