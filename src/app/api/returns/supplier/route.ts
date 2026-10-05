import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import {
  parseJsonBody,
  RequestValidationError,
  supplierReturnRequestSchema,
} from "@/lib/api/validation";
import { requirePhase1Feature } from "@/lib/phase1/feature-flags";
import { processSupplierReturnForUser } from "@/lib/returns/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const disabled = requirePhase1Feature("returns", "Supplier returns");
    if (disabled) {
      return disabled;
    }

    assertSameOriginRequest(request);
    const user = await requireUser();
    const body = await parseJsonBody(request, supplierReturnRequestSchema);
    const limited = await enforceRateLimit(request, "returns.supplier", 60, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const state = await processSupplierReturnForUser({
      userId: user.id,
      input: body,
    });

    return Response.json({ state }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    if (error instanceof RequestValidationError) {
      return jsonError(error.message, 400);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not save supplier return.");
  }
}
