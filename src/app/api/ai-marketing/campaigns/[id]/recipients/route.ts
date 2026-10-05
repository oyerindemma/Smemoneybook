import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  aiMarketingCapabilityPayload,
  aiMarketingErrorResponse,
  aiMarketingMethodNotAllowed,
  parseAiMarketingBusinessRequest,
} from "@/lib/ai-marketing/api";
import { requireAiMarketingAccess } from "@/lib/ai-marketing/authorization";
import { listAiMarketingCampaignRecipients } from "@/lib/ai-marketing/service";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "ai_marketing.recipients.read", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseAiMarketingBusinessRequest(request.url);
    const access = await requireAiMarketingAccess({
      userId: user.id,
      businessId: filters.businessId,
      permission: "ai_marketing:read",
    });
    const { id } = await params;
    const payload = await listAiMarketingCampaignRecipients({
      businessId: access.businessId,
      campaignId: id,
    });

    return Response.json({
      ...payload,
      capabilities: aiMarketingCapabilityPayload(access),
    });
  } catch (error) {
    return aiMarketingErrorResponse(error, "Could not load AI Marketing recipients.");
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
