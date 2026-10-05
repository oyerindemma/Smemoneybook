import { assertSameOriginRequest } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  cooperativesCapabilityPayload,
  cooperativesErrorResponse,
  cooperativesMethodNotAllowed,
  logCooperativesAudit,
} from "@/lib/cooperatives/api";
import { requireCooperativesAccess } from "@/lib/cooperatives/authorization";
import { recordCooperativeLedgerTransfer } from "@/lib/cooperatives/ledger";
import { ledgerTransferSchema } from "@/lib/cooperatives/validation";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: Params) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(request, ledgerTransferSchema);
    const limited = await enforceRateLimit(request, "cooperatives.transfer", 20, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireCooperativesAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: "cooperatives:manage",
    });
    const transfer = await recordCooperativeLedgerTransfer({
      businessId: access.businessId,
      groupId: id,
      direction: body.direction,
      amount: body.amount,
      currency: body.currency,
      memo: body.memo,
      reference: body.reference,
      accountId: body.accountId,
      actorId: user.id,
    });

    await logCooperativesAudit({
      access,
      action: "cooperatives.transfer_recorded",
      metadata: { groupId: id, transferId: transfer.id, direction: body.direction },
    });

    return Response.json({
      transfer,
      capabilities: cooperativesCapabilityPayload(access),
    });
  } catch (error) {
    return cooperativesErrorResponse(error, "Could not record cooperative transfer.");
  }
}

export function GET() {
  return cooperativesMethodNotAllowed("POST");
}

export function PUT() {
  return cooperativesMethodNotAllowed("POST");
}

export function PATCH() {
  return cooperativesMethodNotAllowed("POST");
}

export function DELETE() {
  return cooperativesMethodNotAllowed("POST");
}
