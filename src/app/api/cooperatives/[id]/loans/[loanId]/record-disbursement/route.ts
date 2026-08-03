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
import { recordCooperativeLoanDisbursement } from "@/lib/cooperatives/loans";
import { loanDisbursementSchema } from "@/lib/cooperatives/validation";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string; loanId: string }>;
};

export async function POST(request: Request, { params }: Params) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const { id, loanId } = await params;
    const body = await parseJsonBody(request, loanDisbursementSchema);
    const limited = await enforceRateLimit(request, "cooperatives.loans.disburse", 20, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireCooperativesAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: "cooperatives:record_disbursement",
    });
    const loan = await recordCooperativeLoanDisbursement({
      businessId: access.businessId,
      groupId: id,
      loanId,
      amount: body.amount,
      disbursedAt: body.disbursedAt,
      reference: body.reference,
      actorId: user.id,
    });

    await logCooperativesAudit({
      access,
      action: "cooperatives.loan_disbursement_recorded",
      metadata: { groupId: id, loanId },
    });

    return Response.json({ loan, capabilities: cooperativesCapabilityPayload(access) });
  } catch (error) {
    return cooperativesErrorResponse(error, "Could not record cooperative loan disbursement.");
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
