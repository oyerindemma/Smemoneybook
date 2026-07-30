import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
import { requireLocationAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";
import { maybeRecordAiEvaluationEvent } from "@/lib/phase3/ai-evaluation-service";
import { requireAiMarketingAccess, type AiMarketingPermission } from "@/lib/ai-marketing/authorization";
import { aiMarketingErrorResponse } from "@/lib/ai-marketing/api";
import {
  approveMarketingDraft,
  createMarketingDraftForBusiness,
  listMarketingDrafts,
  recordMarketingDraftFeedback,
} from "@/lib/phase3/ai-marketing-service";

export const runtime = "nodejs";

const businessId = z.preprocess((val) => val ?? "", z.string().trim().min(1, "Choose a business."));
const optionalText = z.preprocess(
  (val) => (typeof val === "string" && val.trim() ? val.trim() : undefined),
  z.string().optional(),
).optional();

const aiMarketingActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_draft"),
    businessId,
    locationId: optionalText,
    channel: z.string().trim().min(2, "Choose a channel."),
    goal: z.string().trim().min(3, "Enter the marketing goal."),
    audience: z.string().trim().min(2, "Enter the audience."),
    tone: z.string().trim().min(2, "Enter the tone."),
    offer: optionalText,
    productId: optionalText,
    useProductData: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("approve_draft"),
    businessId,
    draftId: z.string().trim().min(1, "Choose a draft."),
    reviewConfirmed: z.boolean(),
  }),
  z.object({
    action: z.literal("feedback"),
    businessId,
    draftId: z.string().trim().min(1, "Choose a draft."),
    rating: z.enum(["helpful", "not_helpful", "incorrect", "approved", "rejected"]),
    helpful: z.boolean().optional(),
    correction: optionalText,
  }),
]);

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "ai_marketing.read", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const { searchParams } = new URL(request.url);
    const requestedBusinessId = searchParams.get("businessId") ?? undefined;
    const locationId = searchParams.get("locationId") ?? undefined;
    const access = await requireAiMarketingAccess({
      userId: user.id,
      businessId: requestedBusinessId ?? "",
      permission: "ai_marketing:read",
    });
    const resolvedLocationId = locationId
      ? (await requireLocationAccess({
          userId: user.id,
          businessId: access.businessId,
          locationId,
          permission: "ai_marketing:read",
        })).locationId
      : undefined;

    const drafts = await listMarketingDrafts({
      businessId: access.businessId,
      locationId: resolvedLocationId,
    });

    return Response.json({ drafts });
  } catch (error) {
    return aiMarketingErrorResponse(error, "Could not load marketing drafts.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const body = await parseJsonBody(request, aiMarketingActionSchema);
    const limited = await enforceRateLimit(request, "ai_marketing.write", 40, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireAiMarketingAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: permissionForLegacyAction(body.action),
    });

    if ("locationId" in body && body.locationId) {
      await requireLocationAccess({
        userId: user.id,
        businessId: access.businessId,
        locationId: body.locationId,
        permission: permissionForLegacyAction(body.action),
      });
    }

    const result = await runAction({
      businessId: access.businessId,
      businessName: access.businessName,
      actorId: user.id,
      body,
    });

    await getPrisma().auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: user.id,
        action: `ai_marketing.${body.action}`,
        message: "AI marketing action recorded.",
        metadata: {
          feature: "phase3m_ai_marketing",
          action: body.action,
          resultId: result.id,
          draftOnly: true,
        } as Prisma.InputJsonObject,
      },
    });
    await maybeRecordAiEvaluationEvent({
      businessId: access.businessId,
      actorId: user.id,
      feature: "phase3m_ai_marketing",
      artifactType: "marketing_draft",
      artifactId: "draftId" in body ? body.draftId : result.id,
      eventType: body.action === "create_draft" ? "request" : body.action === "approve_draft" ? "recommendation" : "feedback",
      rating: body.action === "feedback" ? body.rating : undefined,
      accepted: body.action === "approve_draft"
        ? true
        : body.action === "feedback" && body.rating === "approved"
          ? true
          : body.action === "feedback" && body.rating === "rejected"
            ? false
            : undefined,
      correction: body.action === "feedback" ? body.correction : undefined,
      modelVersion: readResultString(result, "modelVersion"),
      promptVersion: "marketing-draft-template-v1",
      metadata: {
        action: body.action,
        draftOnly: true,
      },
    });

    return Response.json({ result, message: "AI marketing action recorded." });
  } catch (error) {
    return aiMarketingErrorResponse(error, "Could not record AI marketing action.");
  }
}

function permissionForLegacyAction(action: z.infer<typeof aiMarketingActionSchema>["action"]): AiMarketingPermission {
  if (action === "approve_draft") {
    return "ai_marketing:approve";
  }

  if (action === "feedback") {
    return "ai_marketing:read";
  }

  return "ai_marketing:create";
}

function readResultString(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" ? candidate : undefined;
}

async function runAction({
  businessId,
  businessName,
  actorId,
  body,
}: {
  businessId: string;
  businessName: string;
  actorId: string;
  body: z.infer<typeof aiMarketingActionSchema>;
}) {
  if (body.action === "create_draft") {
    return createMarketingDraftForBusiness({
      businessId,
      businessName,
      actorId,
      locationId: body.locationId || undefined,
      channel: body.channel,
      goal: body.goal,
      audience: body.audience,
      tone: body.tone,
      offer: body.offer || undefined,
      productId: body.productId || undefined,
      useProductData: body.useProductData,
    });
  }

  if (body.action === "approve_draft") {
    return approveMarketingDraft({
      businessId,
      actorId,
      draftId: body.draftId,
      reviewConfirmed: body.reviewConfirmed,
    });
  }

  return recordMarketingDraftFeedback({
    businessId,
    actorId,
    draftId: body.draftId,
    rating: body.rating,
    helpful: body.helpful,
    correction: body.correction || undefined,
  });
}

export function PUT() {
  return Response.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "GET, POST" } });
}

export function PATCH() {
  return Response.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "GET, POST" } });
}

export function DELETE() {
  return Response.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "GET, POST" } });
}
