import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  cooperativesErrorResponse,
  cooperativesMethodNotAllowed,
  logCooperativesAudit,
  parseCooperativesBusinessRequest,
} from "@/lib/cooperatives/api";
import { requireCooperativesAccess } from "@/lib/cooperatives/authorization";
import { exportCooperativeCsv } from "@/lib/cooperatives/export";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const limited = await enforceRateLimit(request, "cooperatives.export", 20, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseCooperativesBusinessRequest(request.url);
    const access = await requireCooperativesAccess({
      userId: user.id,
      businessId: filters.businessId,
      permission: "cooperatives:export",
    });
    const result = await exportCooperativeCsv({
      businessId: access.businessId,
      groupId: id,
      memberId: filters.memberId,
      from: filters.from ? new Date(filters.from) : undefined,
      to: filters.to ? new Date(filters.to) : undefined,
      includeSensitive: access.canViewMemberSensitive,
    });

    await logCooperativesAudit({
      access,
      action: "cooperatives.export_generated",
      metadata: { groupId: id, memberId: filters.memberId },
    });

    return new Response(result.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
      },
    });
  } catch (error) {
    return cooperativesErrorResponse(error, "Could not export cooperatives.");
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
