import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import {
  parseJsonBody,
  posCheckoutRequestSchema,
  RequestValidationError,
} from "@/lib/api/validation";
import { requirePeopleAllowance, requireTransactionAllowance } from "@/lib/billing/free-limits";
import { requirePhase1Feature } from "@/lib/phase1/feature-flags";
import { checkoutPosForUser } from "@/lib/pos/checkout";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const disabled = requirePhase1Feature("pos", "POS checkout");
    if (disabled) {
      return disabled;
    }

    assertSameOriginRequest(request);
    const user = await requireUser();
    const body = await parseJsonBody(request, posCheckoutRequestSchema);
    const limited = await enforceRateLimit(request, "pos.checkout", 120, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const transactionGate = await requireTransactionAllowance(user.id, body.businessId);

    if (transactionGate) {
      return transactionGate;
    }

    if (body.customerName || body.customerId) {
      const peopleGate = await requirePeopleAllowance(user.id, body.businessId);

      if (peopleGate) {
        return peopleGate;
      }
    }

    const result = await checkoutPosForUser({
      userId: user.id,
      input: body,
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    if (error instanceof RequestValidationError) {
      return jsonError(error.message, 400);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not save checkout.");
  }
}
