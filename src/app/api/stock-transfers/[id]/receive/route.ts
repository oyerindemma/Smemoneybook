import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import {
  parseJsonBody,
  stockTransferReceiveRequestSchema,
} from "@/lib/api/validation";
import { requireFeatureAccess } from "@/lib/billing/subscriptions";
import { requireBusinessAccess } from "@/lib/operations/access";
import { requirePhase2Feature } from "@/lib/phase2/feature-flags";
import { receiveStockTransferForUser } from "@/lib/transfers/service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const gated = requirePhase2Feature("transfers", "Stock transfers");

    if (gated) {
      return gated;
    }

    const user = await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(request, stockTransferReceiveRequestSchema);
    const access = await requireBusinessAccess(user.id, "transfers:receive", body.businessId);
    const featureGate = await requireFeatureAccess(user.id, access.businessId, "warehouse_transfers");

    if (featureGate) {
      return featureGate;
    }

    const limited = await enforceRateLimit(request, "stock_transfers.receive", 40, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const transfer = await receiveStockTransferForUser({
      userId: user.id,
      businessId: body.businessId,
      transferId: id,
      input: body,
    });
    return Response.json({ transfer });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not receive transfer.");
  }
}
