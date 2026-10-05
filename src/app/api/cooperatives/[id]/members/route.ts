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
import { addCooperativeMember, listCooperativeDashboard } from "@/lib/cooperatives/contributions";
import { memberCreateSchema } from "@/lib/cooperatives/validation";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const limited = await enforceRateLimit(request, "cooperatives.members.list", 80, 15 * 60 * 1000);

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
      members: group.members,
      capabilities: cooperativesCapabilityPayload(access),
    });
  } catch (error) {
    return cooperativesErrorResponse(error, "Could not load cooperative members.");
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(request, memberCreateSchema);
    const limited = await enforceRateLimit(request, "cooperatives.members.create", 30, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireCooperativesAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: "cooperatives:manage_members",
    });
    const member = await addCooperativeMember({
      ...body,
      businessId: access.businessId,
      groupId: id,
    });

    await logCooperativesAudit({
      access,
      action: "cooperatives.member_created",
      metadata: { groupId: id, memberId: member.id },
    });

    return Response.json({
      member,
      capabilities: cooperativesCapabilityPayload(access),
    });
  } catch (error) {
    return cooperativesErrorResponse(error, "Could not add cooperative member.");
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
