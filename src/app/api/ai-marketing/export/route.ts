import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  aiMarketingErrorResponse,
  aiMarketingMethodNotAllowed,
  logAiMarketingAudit,
  parseAiMarketingBusinessRequest,
  AiMarketingDomainError,
} from "@/lib/ai-marketing/api";
import { requireAiMarketingAccess } from "@/lib/ai-marketing/authorization";
import {
  aiMarketingCampaignExportFilename,
  buildAiMarketingCampaignCsv,
} from "@/lib/ai-marketing/export";
import { getAiMarketingCampaignForExport } from "@/lib/ai-marketing/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "ai_marketing.export", 30, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseAiMarketingBusinessRequest(request.url);
    const campaignId = new URL(request.url).searchParams.get("campaignId")?.trim();

    if (!campaignId) {
      throw new AiMarketingDomainError("Choose an AI Marketing campaign to export.", 400, "campaign_required");
    }

    const access = await requireAiMarketingAccess({
      userId: user.id,
      businessId: filters.businessId,
      permission: "ai_marketing:export",
    });
    const campaign = await getAiMarketingCampaignForExport({
      businessId: access.businessId,
      campaignId,
    });
    const csv = buildAiMarketingCampaignCsv({
      campaign,
      generatedBy: user.email,
    });

    await logAiMarketingAudit({
      access,
      action: "ai_marketing.export_generated",
      metadata: {
        campaignId,
      },
    });

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${aiMarketingCampaignExportFilename(campaign)}"`,
      },
    });
  } catch (error) {
    return aiMarketingErrorResponse(error, "Could not export AI Marketing campaign.");
  }
}

export function POST() {
  return aiMarketingMethodNotAllowed();
}

export function PUT() {
  return aiMarketingMethodNotAllowed();
}

export function PATCH() {
  return aiMarketingMethodNotAllowed();
}

export function DELETE() {
  return aiMarketingMethodNotAllowed();
}
