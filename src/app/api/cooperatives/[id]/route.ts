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
import { listCooperativeDashboard, updateCooperativeGroup } from "@/lib/cooperatives/contributions";
import { groupUpdateSchema } from "@/lib/cooperatives/validation";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const limited = await enforceRateLimit(request, "cooperatives.group.detail", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseCooperativesBusinessRequest(request.url);
    const access = await requireCooperativesAccess({
      userId: user.id,
      businessId: filters.businessId,
      permission: "cooperatives:read",
    });
    const groups = await listCooperativeDashboard({
      businessId: access.businessId,
      includeSensitive: access.canViewMemberSensitive,
    });
    const group = groups.find((item) => item.id === id);

    if (!group) {
      return Response.json({ error: "Choose a valid cooperative group." }, { status: 404 });
    }

    return Response.json({
      group,
      capabilities: cooperativesCapabilityPayload(access),
    });
  } catch (error) {
    return cooperativesErrorResponse(error, "Could not load cooperative group.");
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(request, groupUpdateSchema);
    const limited = await enforceRateLimit(request, "cooperatives.group.update", 30, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireCooperativesAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: "cooperatives:manage",
    });
    const group = await updateCooperativeGroup({
      ...body,
      businessId: access.businessId,
      groupId: id,
    });

    await logCooperativesAudit({
      access,
      action: "cooperatives.group_updated",
      metadata: { groupId: id },
    });

    return Response.json({
      group,
      capabilities: cooperativesCapabilityPayload(access),
    });
  } catch (error) {
    return cooperativesErrorResponse(error, "Could not update cooperative group.");
  }
}

export function POST() {
  return cooperativesMethodNotAllowed("GET, PUT");
}

export function PATCH() {
  return cooperativesMethodNotAllowed("GET, PUT");
}

export function DELETE() {
  return cooperativesMethodNotAllowed("GET, PUT");
}
