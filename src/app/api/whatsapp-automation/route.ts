import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
import { requireMinimumPlan } from "@/lib/billing/subscriptions";
import { requireBusinessAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";
import { requirePhase3Feature } from "@/lib/phase3/feature-flags";
import {
  listWhatsAppAutomationDashboard,
  queueWhatsAppAutomationJob,
  upsertWhatsAppAutomationContact,
  upsertWhatsAppAutomationTemplate,
} from "@/lib/phase3/whatsapp-automation-service";

export const runtime = "nodejs";

const businessId = z.preprocess((val) => val ?? "", z.string().trim().min(1, "Choose a business."));
const optionalText = z.preprocess(
  (val) => (typeof val === "string" && val.trim() ? val.trim() : undefined),
  z.string().optional(),
).optional();

const whatsappAutomationActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("upsert_contact"),
    businessId,
    phone: z.string().trim().min(5, "Enter a WhatsApp phone number."),
    name: optionalText,
    consentStatus: z.enum(["PENDING", "OPTED_IN", "OPTED_OUT"]),
    consentSource: optionalText,
    tags: z.array(z.string().trim().min(1)).optional(),
  }),
  z.object({
    action: z.literal("register_template"),
    businessId,
    templateName: z.string().trim().min(2, "Enter the template name."),
    category: z.string().trim().min(2, "Enter the template category."),
    languageCode: optionalText,
    status: z.enum(["PENDING", "APPROVED", "REJECTED", "PAUSED"]),
    rejectedReason: optionalText,
  }),
  z.object({
    action: z.literal("queue_message"),
    businessId,
    phone: z.string().trim().min(5, "Enter a WhatsApp phone number."),
    automationType: z.string().trim().min(2, "Enter the automation type."),
    templateName: optionalText,
    languageCode: optionalText,
    messagePreview: z.string().trim().min(2, "Enter the message preview."),
    scheduledFor: z.coerce.date().optional(),
    costKobo: z.coerce.number().nonnegative().optional(),
  }),
]);

export async function GET(request: Request) {
  try {
    const featureGate = requirePhase3Feature("whatsappAutomation", "WhatsApp automation");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const limited = await enforceRateLimit(request, "whatsapp_automation.read", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const requestedBusinessId = new URL(request.url).searchParams.get("businessId") ?? undefined;
    const access = await requireBusinessAccess(user.id, "admin", requestedBusinessId);
    const planGate = await requireMinimumPlan(
      user.id,
      access.businessId,
      "growth",
      "Upgrade to Growth to use WhatsApp automation.",
    );

    if (planGate) {
      return planGate;
    }

    const dashboard = await listWhatsAppAutomationDashboard({ businessId: access.businessId });

    return Response.json({ dashboard });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("whatsapp_automation.read_failed", error);
    return jsonErrorFromUnknown(error, "Could not load WhatsApp automation.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const featureGate = requirePhase3Feature("whatsappAutomation", "WhatsApp automation");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const body = await parseJsonBody(request, whatsappAutomationActionSchema);
    const limited = await enforceRateLimit(request, "whatsapp_automation.write", 40, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireBusinessAccess(user.id, "admin", body.businessId);
    const planGate = await requireMinimumPlan(
      user.id,
      access.businessId,
      "growth",
      "Upgrade to Growth to use WhatsApp automation.",
    );

    if (planGate) {
      return planGate;
    }

    const result = await runAction({
      businessId: access.businessId,
      actorId: user.id,
      body,
    });

    await getPrisma().auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: user.id,
        action: `whatsapp_automation.${body.action}`,
        message: "WhatsApp automation action recorded.",
        metadata: {
          feature: "phase3l_whatsapp_automation",
          action: body.action,
          resultId: result.id,
        } as Prisma.InputJsonObject,
      },
    });

    return Response.json({ result, message: "WhatsApp automation action recorded." });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("whatsapp_automation.write_failed", error);
    return jsonErrorFromUnknown(error, "Could not record WhatsApp automation action.");
  }
}

async function runAction({
  businessId,
  actorId,
  body,
}: {
  businessId: string;
  actorId: string;
  body: z.infer<typeof whatsappAutomationActionSchema>;
}) {
  if (body.action === "upsert_contact") {
    return upsertWhatsAppAutomationContact({
      businessId,
      phone: body.phone,
      name: body.name || undefined,
      consentStatus: body.consentStatus,
      consentSource: body.consentSource || undefined,
      tags: body.tags,
    });
  }

  if (body.action === "register_template") {
    return upsertWhatsAppAutomationTemplate({
      businessId,
      templateName: body.templateName,
      category: body.category,
      languageCode: body.languageCode || undefined,
      status: body.status,
      rejectedReason: body.rejectedReason || undefined,
    });
  }

  return queueWhatsAppAutomationJob({
    businessId,
    actorId,
    phone: body.phone,
    automationType: body.automationType,
    templateName: body.templateName || undefined,
    languageCode: body.languageCode || undefined,
    messagePreview: body.messagePreview,
    scheduledFor: body.scheduledFor,
    costKobo: body.costKobo,
  });
}
