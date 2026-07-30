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
import { aiMarketingChannels, aiMarketingConsentStatuses } from "@/lib/ai-marketing/consent";
import { updateCustomerMarketingConsent } from "@/lib/ai-marketing/service";

export const runtime = "nodejs";

const consentSchema = z.object({
  businessId: z.preprocess((value) => value ?? "", z.string().trim().min(1, "Choose a business.")),
  marketingConsentStatus: z.enum(aiMarketingConsentStatuses),
  marketingConsentSource: z.preprocess((value) => value ?? "", z.string().trim().max(120)).optional(),
  preferredChannel: z.enum(aiMarketingChannels).optional(),
  doNotContact: z.boolean().optional(),
  consentNotes: z.preprocess((value) => value ?? "", z.string().trim().max(500)).optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "ai_marketing.consent.update", 40, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const body = await parseJsonBody(request, consentSchema);
    const access = await requireAiMarketingAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: "ai_marketing:manage_consent",
    });
    const { id } = await params;
    const customer = await updateCustomerMarketingConsent({
      businessId: access.businessId,
      customerId: id,
      consentStatus: body.marketingConsentStatus,
      consentSource: body.marketingConsentSource,
      preferredChannel: body.preferredChannel,
      doNotContact: body.doNotContact,
      consentNotes: body.consentNotes,
    });

    await logAiMarketingAudit({
      access,
      action: "ai_marketing.consent_updated",
      metadata: {
        customerId: id,
        consentStatus: customer.marketingConsentStatus,
        preferredChannel: customer.preferredChannel,
        doNotContact: customer.doNotContact,
      },
    });

    if (customer.marketingConsentStatus === "opted_out" || customer.doNotContact) {
      await logAiMarketingAudit({
        access,
        action: "ai_marketing.opt_out_recorded",
        metadata: {
          customerId: id,
          preferredChannel: customer.preferredChannel,
          doNotContact: customer.doNotContact,
        },
      });
    }

    return Response.json({
      customer,
      capabilities: aiMarketingCapabilityPayload(access),
    });
  } catch (error) {
    return aiMarketingErrorResponse(error, "Could not update AI Marketing consent.");
  }
}

export function GET() {
  return aiMarketingMethodNotAllowed("PUT");
}

export function POST() {
  return aiMarketingMethodNotAllowed("PUT");
}

export function PATCH() {
  return aiMarketingMethodNotAllowed("PUT");
}

export function DELETE() {
  return aiMarketingMethodNotAllowed("PUT");
}
