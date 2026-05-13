import { requireUser } from "@/lib/auth/session";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import {
  parseJsonBody,
  RequestValidationError,
  reversalRequestSchema,
} from "@/lib/api/validation";
import { reverseTransactionForUser } from "@/lib/bookkeeping/persistence";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(request, reversalRequestSchema);
    const state = await reverseTransactionForUser({
      userId: user.id,
      businessId: body.businessId,
      transactionId: id,
      reason: body.reason,
    });

    return Response.json({ state });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    if (!(error instanceof RequestValidationError)) {
      console.error(error);
    }

    return jsonErrorFromUnknown(error, "Could not reverse this record.");
  }
}
