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
} from "@/lib/ai-marketing/api";
import { requireAiMarketingAccess } from "@/lib/ai-marketing/authorization";
import { approveAiMarketingCampaign, getAiMarketingSetup } from "@/lib/ai-marketing/service";

export const runtime = "nodejs";

const approvalSchema = z.object({
  businessId: z.preprocess((value) => value ?? "", z.string().trim().min(1, "Choose a business.")),
  draftId: z.string().trim().min(1, "Choose a draft."),
  reviewConfirmed: z.boolean(),
  content: z.preprocess((value) => value ?? "", z.string().trim().max(2_000)).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "ai_marketing.campaign.approve", 20, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const body = await parseJsonBody(request, approvalSchema);
    const access = await requireAiMarketingAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: "ai_marketing:approve",
    });
    const { id } = await params;
    const campaign = await approveAiMarketingCampaign({
      businessId: access.businessId,
      campaignId: id,
      draftId: body.draftId,
      approvedByUserId: user.id,
      reviewConfirmed: body.reviewConfirmed,
      content: body.content,
    });

    await logAiMarketingAudit({
      access,
      action: body.content ? "ai_marketing.content_edited" : "ai_marketing.campaign_approved",
      metadata: {
        campaignId: id,
        draftId: body.draftId,
        edited: Boolean(body.content),
      },
    });

    if (body.content) {
      await logAiMarketingAudit({
        access,
        action: "ai_marketing.campaign_approved",
        metadata: {
          campaignId: id,
          draftId: body.draftId,
          edited: true,
        },
      });
    }

    return Response.json({
      campaign,
      setup: getAiMarketingSetup(),
      capabilities: aiMarketingCapabilityPayload(access),
    });
  } catch (error) {
    return aiMarketingErrorResponse(error, "Could not approve AI Marketing campaign.");
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
