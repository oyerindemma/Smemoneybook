import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { inventoryMovementRequestSchema, parseJsonBody } from "@/lib/api/validation";
import { moveInventoryForUser } from "@/lib/bookkeeping/persistence";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(request, inventoryMovementRequestSchema);
    const limited = await enforceRateLimit(request, "inventory.movements.write", 120, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const state = await moveInventoryForUser({
      userId: user.id,
      businessId: body.businessId,
      itemId: id,
      quantity: body.quantity,
      direction: "in",
      locationId: body.locationId,
      adjustmentType: body.adjustmentType,
      reason: body.reason,
      note: body.note,
      attachmentUrl: body.attachmentUrl,
      idempotencyKey: body.idempotencyKey,
    });

    return Response.json({ state });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not add stock.");
  }
}
