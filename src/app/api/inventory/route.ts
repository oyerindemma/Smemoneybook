import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { inventoryItemRequestSchema, parseJsonBody } from "@/lib/api/validation";
import {
  createInventoryItemForUser,
  getInventoryForUser,
} from "@/lib/bookkeeping/persistence";
import { requireInventoryItemAllowance } from "@/lib/billing/free-limits";
import { requireBusinessAccess } from "@/lib/operations/access";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const items = await getInventoryForUser(user.id);

    if (!items) {
      return jsonError("Create a business to track products.", 404);
    }

    return Response.json({ items });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonError("Could not load products.", 500);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const body = await parseJsonBody(request, inventoryItemRequestSchema);
    const limited = await enforceRateLimit(request, "inventory.write", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireBusinessAccess(user.id, "inventory:write", body.businessId);
    const gated = await requireInventoryItemAllowance(user.id, access.businessId);

    if (gated) {
      return gated;
    }

    const state = await createInventoryItemForUser({
      userId: user.id,
      ...body,
    });

    return Response.json({ state }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not add product.");
  }
}
