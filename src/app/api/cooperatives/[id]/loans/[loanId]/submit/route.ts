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
import { submitCooperativeLoanForReview } from "@/lib/cooperatives/loans";
import { loanActionSchema } from "@/lib/cooperatives/validation";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string; loanId: string }>;
};

export async function POST(request: Request, { params }: Params) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const { id, loanId } = await params;
    const body = await parseJsonBody(request, loanActionSchema);
    const limited = await enforceRateLimit(request, "cooperatives.loans.submit", 30, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireCooperativesAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: "cooperatives:review_loans",
    });
    const loan = await submitCooperativeLoanForReview({
      businessId: access.businessId,
      groupId: id,
      loanId,
      actorId: user.id,
    });

    await logCooperativesAudit({
      access,
      action: "cooperatives.loan_submitted",
      metadata: { groupId: id, loanId },
    });

    return Response.json({ loan, capabilities: cooperativesCapabilityPayload(access) });
  } catch (error) {
    return cooperativesErrorResponse(error, "Could not submit cooperative loan.");
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
