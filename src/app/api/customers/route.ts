import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { customerRequestSchema, parseJsonBody } from "@/lib/api/validation";
import { requirePeopleAllowance } from "@/lib/billing/free-limits";
import { createCustomerForUser } from "@/lib/bookkeeping/persistence";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const body = await parseJsonBody(request, customerRequestSchema);
    const limited = await enforceRateLimit(request, "customers.write", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const peopleGate = await requirePeopleAllowance(user.id, body.businessId);

    if (peopleGate) {
      return peopleGate;
    }

    const state = await createCustomerForUser({
      userId: user.id,
      businessId: body.businessId,
      name: body.name,
      phone: body.phone,
    });

    return Response.json({ state }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not add customer.");
  }
}
