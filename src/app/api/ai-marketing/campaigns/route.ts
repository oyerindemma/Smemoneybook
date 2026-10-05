import { z } from "zod";
import { assertSameOriginRequest } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
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
import { aiMarketingSegmentKeys } from "@/lib/ai-marketing/segments";
import {
  createAiMarketingCampaign,
  getAiMarketingSetup,
  listAiMarketingCampaigns,
} from "@/lib/ai-marketing/service";

export const runtime = "nodejs";

const campaignSchema = z.object({
  businessId: z.preprocess((value) => value ?? "", z.string().trim().min(1, "Choose a business.")),
  name: z.string().trim().min(2, "Enter a campaign name.").max(120),
  objective: z.string().trim().min(5, "Enter a campaign objective.").max(500),
  channel: z.enum(["whatsapp", "sms", "email", "phone"]).default("whatsapp"),
  segmentKey: z.enum(aiMarketingSegmentKeys),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
  scheduledAt: z.coerce.date().optional(),
});

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "ai_marketing.campaigns.read", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseAiMarketingBusinessRequest(request.url);
    const access = await requireAiMarketingAccess({
      userId: user.id,
      businessId: filters.businessId,
      permission: "ai_marketing:read",
    });
    const campaigns = await listAiMarketingCampaigns({ businessId: access.businessId });

    return Response.json({
      campaigns,
      setup: getAiMarketingSetup(),
      capabilities: aiMarketingCapabilityPayload(access),
    });
  } catch (error) {
    return aiMarketingErrorResponse(error, "Could not load AI Marketing campaigns.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "ai_marketing.campaigns.create", 25, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const body = await parseJsonBody(request, campaignSchema);
    const access = await requireAiMarketingAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: "ai_marketing:create",
    });
    const periodEnd = body.periodEnd ?? new Date();
    const periodStart = body.periodStart ?? new Date(periodEnd.getTime() - 90 * 24 * 60 * 60 * 1000);
    const campaign = await createAiMarketingCampaign({
      businessId: access.businessId,
      createdByUserId: user.id,
      name: body.name,
      objective: body.objective,
      channel: body.channel,
      segmentKey: body.segmentKey,
      periodStart,
      periodEnd,
      scheduledAt: body.scheduledAt,
    });

    await logAiMarketingAudit({
      access,
      action: "ai_marketing.campaign_created",
      metadata: {
        campaignId: campaign.id,
        segmentKey: body.segmentKey,
        channel: body.channel,
        recipientSummary: campaign.recipientSummary,
      },
    });

    return Response.json({
      campaign,
      setup: getAiMarketingSetup(),
      capabilities: aiMarketingCapabilityPayload(access),
    }, { status: 201 });
  } catch (error) {
    return aiMarketingErrorResponse(error, "Could not create AI Marketing campaign.");
  }
}

export function PUT() {
  return aiMarketingMethodNotAllowed("GET, POST");
}

export function PATCH() {
  return aiMarketingMethodNotAllowed("GET, POST");
}

export function DELETE() {
  return aiMarketingMethodNotAllowed("GET, POST");
}
