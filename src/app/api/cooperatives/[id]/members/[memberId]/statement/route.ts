import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  cooperativesCapabilityPayload,
  cooperativesErrorResponse,
  cooperativesMethodNotAllowed,
  parseCooperativesBusinessRequest,
} from "@/lib/cooperatives/api";
import { requireCooperativesAccess } from "@/lib/cooperatives/authorization";
import { getCooperativeMemberStatement } from "@/lib/cooperatives/statements";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string; memberId: string }>;
};

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id, memberId } = await params;
    const limited = await enforceRateLimit(request, "cooperatives.member.statement", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseCooperativesBusinessRequest(request.url);
    const access = await requireCooperativesAccess({
      userId: user.id,
      businessId: filters.businessId,
      permission: "cooperatives:read",
    });
    const statement = await getCooperativeMemberStatement({
      businessId: access.businessId,
      groupId: id,
      memberId,
      from: filters.from ? new Date(filters.from) : undefined,
      to: filters.to ? new Date(filters.to) : undefined,
      includeSensitive: access.canViewMemberSensitive,
    });

    return Response.json({
      statement,
      capabilities: cooperativesCapabilityPayload(access),
    });
  } catch (error) {
    return cooperativesErrorResponse(error, "Could not load member statement.");
  }
}

export function POST() {
  return cooperativesMethodNotAllowed("GET");
}

export function PUT() {
  return cooperativesMethodNotAllowed("GET");
}

export function PATCH() {
  return cooperativesMethodNotAllowed("GET");
}

export function DELETE() {
  return cooperativesMethodNotAllowed("GET");
}
