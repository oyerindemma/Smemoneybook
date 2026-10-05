import { assertSameOriginRequest } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  cooperativesCapabilityPayload,
  cooperativesErrorResponse,
  cooperativesMethodNotAllowed,
  logCooperativesAudit,
  parseCooperativesBusinessRequest,
} from "@/lib/cooperatives/api";
import { requireCooperativesAccess } from "@/lib/cooperatives/authorization";
import { listCooperativeDashboard, recordCooperativeContribution } from "@/lib/cooperatives/contributions";
import { contributionRecordSchema } from "@/lib/cooperatives/validation";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const limited = await enforceRateLimit(request, "cooperatives.contributions.list", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseCooperativesBusinessRequest(request.url);
    const access = await requireCooperativesAccess({
      userId: user.id,
      businessId: filters.businessId,
      permission: "cooperatives:read",
    });
    const groups = await listCooperativeDashboard({ businessId: access.businessId });
    const group = groups.find((item) => item.id === id);

    if (!group) {
      return Response.json({ error: "Choose a valid cooperative group." }, { status: 404 });
    }

    return Response.json({
      contributions: group.contributions,
      capabilities: cooperativesCapabilityPayload(access),
    });
  } catch (error) {
    return cooperativesErrorResponse(error, "Could not load cooperative contributions.");
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(request, contributionRecordSchema);
    const limited = await enforceRateLimit(request, "cooperatives.contributions.record", 40, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireCooperativesAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: "cooperatives:record_contributions",
    });
    const contribution = await recordCooperativeContribution({
      ...body,
      businessId: access.businessId,
      groupId: id,
      actorId: user.id,
    });

    await logCooperativesAudit({
      access,
      action: "cooperatives.contribution_recorded",
      metadata: { groupId: id, contributionId: contribution.id },
    });

    return Response.json({
      contribution,
      capabilities: cooperativesCapabilityPayload(access),
    });
  } catch (error) {
    return cooperativesErrorResponse(error, "Could not record cooperative contribution.");
  }
}

export function PUT() {
  return cooperativesMethodNotAllowed("GET, POST");
}

export function PATCH() {
  return cooperativesMethodNotAllowed("GET, POST");
}

export function DELETE() {
  return cooperativesMethodNotAllowed("GET, POST");
}
