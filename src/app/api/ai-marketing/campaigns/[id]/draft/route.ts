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
import { generateAiMarketingCampaignDraft, getAiMarketingSetup } from "@/lib/ai-marketing/service";

export const runtime = "nodejs";

const draftSchema = z.object({
  businessId: z.preprocess((value) => value ?? "", z.string().trim().min(1, "Choose a business.")),
  tone: z.preprocess((value) => value ?? "", z.string().trim().max(120)).optional(),
  editableNotes: z.preprocess((value) => value ?? "", z.string().trim().max(500)).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "ai_marketing.draft.generate", 20, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const body = await parseJsonBody(request, draftSchema);
    const access = await requireAiMarketingAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: "ai_marketing:create",
    });
    const { id } = await params;
    const draft = await generateAiMarketingCampaignDraft({
      businessId: access.businessId,
      campaignId: id,
      createdByUserId: user.id,
      businessName: access.businessName,
      tone: body.tone,
      editableNotes: body.editableNotes,
    });

    await logAiMarketingAudit({
      access,
      action: "ai_marketing.draft_generated",
      metadata: {
        campaignId: id,
        draftId: draft.id,
        promptVersion: draft.promptVersion,
        model: draft.model,
      },
    });

    return Response.json({
      draft,
      setup: getAiMarketingSetup(),
      capabilities: aiMarketingCapabilityPayload(access),
    }, { status: 201 });
  } catch (error) {
    return aiMarketingErrorResponse(error, "Could not generate AI Marketing draft.");
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
