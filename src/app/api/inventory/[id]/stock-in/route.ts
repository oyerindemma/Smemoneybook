import { requireUser } from "@/lib/auth/session";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { inventoryMovementRequestSchema, parseJsonBody } from "@/lib/api/validation";
import { moveInventoryForUser } from "@/lib/bookkeeping/persistence";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(request, inventoryMovementRequestSchema);

    const state = await moveInventoryForUser({
      userId: user.id,
      itemId: id,
      quantity: body.quantity,
      direction: "in",
      note: body.note,
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
