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
import { reverseCooperativeContribution } from "@/lib/cooperatives/contributions";
import { contributionReverseSchema } from "@/lib/cooperatives/validation";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string; contributionId: string }>;
};

export async function POST(request: Request, { params }: Params) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const { id, contributionId } = await params;
    const body = await parseJsonBody(request, contributionReverseSchema);
    const limited = await enforceRateLimit(request, "cooperatives.contributions.reverse", 20, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireCooperativesAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: "cooperatives:record_contributions",
    });
    const contribution = await reverseCooperativeContribution({
      businessId: access.businessId,
      groupId: id,
      contributionId,
      reason: body.reason,
      actorId: user.id,
    });

    await logCooperativesAudit({
      access,
      action: "cooperatives.contribution_reversed",
      metadata: { groupId: id, contributionId },
    });

    return Response.json({
      contribution,
      capabilities: cooperativesCapabilityPayload(access),
    });
  } catch (error) {
    return cooperativesErrorResponse(error, "Could not reverse cooperative contribution.");
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
