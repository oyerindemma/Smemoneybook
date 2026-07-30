import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  aiMarketingCapabilityPayload,
  aiMarketingErrorResponse,
  aiMarketingMethodNotAllowed,
  logAiMarketingAudit,
  parseAiMarketingPeriodRequest,
} from "@/lib/ai-marketing/api";
import { requireAiMarketingAccess } from "@/lib/ai-marketing/authorization";
import { getAiMarketingSetup, listAiMarketingSegments } from "@/lib/ai-marketing/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "ai_marketing.segments.read", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseAiMarketingPeriodRequest(request.url);
    const access = await requireAiMarketingAccess({
      userId: user.id,
      businessId: filters.businessId,
      permission: "ai_marketing:read",
    });
    const segments = await listAiMarketingSegments({
      businessId: access.businessId,
      periodStart: filters.start,
      periodEnd: filters.end,
    });

    await logAiMarketingAudit({
      access,
      action: "ai_marketing.segment_viewed",
      metadata: {
        start: filters.start.toISOString(),
        end: filters.end.toISOString(),
        segmentCount: segments.length,
      },
    });

    return Response.json({
      segments,
      setup: getAiMarketingSetup(),
      capabilities: aiMarketingCapabilityPayload(access),
    });
  } catch (error) {
    return aiMarketingErrorResponse(error, "Could not load AI Marketing segments.");
  }
}

export function POST() {
  return aiMarketingMethodNotAllowed("GET");
}

export function PUT() {
  return aiMarketingMethodNotAllowed("GET");
}

export function PATCH() {
  return aiMarketingMethodNotAllowed("GET");
}

export function DELETE() {
  return aiMarketingMethodNotAllowed("GET");
}
