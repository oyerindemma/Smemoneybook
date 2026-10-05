import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import {
  parseJsonBody,
  stockTransferCreateRequestSchema,
} from "@/lib/api/validation";
import { requireFeatureAccess } from "@/lib/billing/subscriptions";
import { requireBusinessAccess } from "@/lib/operations/access";
import { requirePhase2Feature } from "@/lib/phase2/feature-flags";
import {
  createStockTransferForUser,
  listStockTransfersForUser,
} from "@/lib/transfers/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const gated = requirePhase2Feature("transfers", "Stock transfers");

    if (gated) {
      return gated;
    }

    const user = await requireUser();
    const businessId = new URL(request.url).searchParams.get("businessId") ?? undefined;
    const access = await requireBusinessAccess(user.id, "transfers:view", businessId);
    const featureGate = await requireFeatureAccess(user.id, access.businessId, "warehouse_transfers");

    if (featureGate) {
      return featureGate;
    }

    const limited = await enforceRateLimit(request, "stock_transfers.read", 120, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const transfers = await listStockTransfersForUser(user.id, access.businessId);
    return Response.json({ transfers });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not load transfers.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const gated = requirePhase2Feature("transfers", "Stock transfers");

    if (gated) {
      return gated;
    }

    const user = await requireUser();
    const body = await parseJsonBody(request, stockTransferCreateRequestSchema);
    const access = await requireBusinessAccess(user.id, "transfers:create", body.businessId);
    const featureGate = await requireFeatureAccess(user.id, access.businessId, "warehouse_transfers");

    if (featureGate) {
      return featureGate;
    }

    const limited = await enforceRateLimit(request, "stock_transfers.write", 40, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const transfer = await createStockTransferForUser(user.id, body);
    return Response.json({ transfer }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not create transfer.");
  }
}
