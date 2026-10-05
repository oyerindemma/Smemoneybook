import { assertSameOriginRequest } from "@/lib/api/http";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  aiMarketingCapabilityPayload,
  aiMarketingErrorResponse,
  aiMarketingMethodNotAllowed,
  logAiMarketingAudit,
  parseAiMarketingBusinessRequest,
} from "@/lib/ai-marketing/api";
import { requireAiMarketingAccess } from "@/lib/ai-marketing/authorization";
import { attemptAiMarketingSend, getAiMarketingSetup } from "@/lib/ai-marketing/service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "ai_marketing.campaign.send", 10, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseAiMarketingBusinessRequest(request.url);
    const access = await requireAiMarketingAccess({
      userId: user.id,
      businessId: filters.businessId,
      permission: "ai_marketing:send",
    });
    const { id } = await params;
    const delivery = await attemptAiMarketingSend({
      businessId: access.businessId,
      campaignId: id,
    });

    await logAiMarketingAudit({
      access,
      action: "ai_marketing.sending_attempted",
      metadata: {
        campaignId: id,
        status: delivery.status,
        sentCount: delivery.sentCount,
        eligibleRecipientCount: delivery.eligibleRecipientCount,
      },
    });

    return Response.json({
      delivery,
      setup: getAiMarketingSetup(),
      capabilities: aiMarketingCapabilityPayload(access),
    });
  } catch (error) {
    return aiMarketingErrorResponse(error, "Could not send AI Marketing campaign.");
  }
}

export function GET() {
  return aiMarketingMethodNotAllowed("POST");
}

export function PUT() {
  return aiMarketingMethodNotAllowed("POST");
}

export function PATCH() {
  return aiMarketingMethodNotAllowed("POST");
}

export function DELETE() {
  return aiMarketingMethodNotAllowed("POST");
}
