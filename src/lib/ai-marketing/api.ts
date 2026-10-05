import { Prisma } from "@prisma/client";
import { jsonError } from "@/lib/api/http";
import {
  AiMarketingAccessError,
  type AiMarketingAccess,
} from "@/lib/ai-marketing/authorization";
import {
  AiMarketingDraftingSetupError,
} from "@/lib/ai-marketing/drafting";
import { getPrisma } from "@/lib/prisma";

export class AiMarketingDomainError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "ai_marketing_invalid") {
    super(message);
    this.name = "AiMarketingDomainError";
    this.status = status;
    this.code = code;
  }
}

export function parseAiMarketingBusinessRequest(url: string) {
  const searchParams = new URL(url).searchParams;

  return {
    businessId: searchParams.get("businessId")?.trim() ?? "",
  };
}

export function parseAiMarketingPeriodRequest(url: string) {
  const searchParams = new URL(url).searchParams;
  const end = readDate(searchParams.get("end"), new Date());
  const start = readDate(searchParams.get("start"), new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000));

  return {
    businessId: searchParams.get("businessId")?.trim() ?? "",
    start,
    end,
  };
}

export function aiMarketingMethodNotAllowed(allow = "GET") {
  return Response.json(
    { error: "Method not allowed." },
    {
      status: 405,
      headers: { Allow: allow },
    },
  );
}

export function aiMarketingErrorResponse(error: unknown, fallback: string) {
  if (error instanceof AiMarketingAccessError || error instanceof AiMarketingDomainError) {
    return jsonError(error.message, error.status);
  }

  if (error instanceof AiMarketingDraftingSetupError) {
    return jsonError(error.message, 503);
  }

  if (error instanceof Response) {
    return jsonError(error.statusText || "Sign in to continue.", error.status);
  }

  if (error instanceof Error && error.message.includes("protected or sensitive")) {
    return jsonError(error.message, 400);
  }

  console.error("ai_marketing.request_failed", error);
  return jsonError(fallback, 500);
}

export async function logAiMarketingAudit({
  access,
  action,
  metadata = {},
}: {
  access: AiMarketingAccess;
  action:
    | "ai_marketing.segment_viewed"
    | "ai_marketing.campaign_created"
    | "ai_marketing.draft_generated"
    | "ai_marketing.content_edited"
    | "ai_marketing.campaign_approved"
    | "ai_marketing.sending_attempted"
    | "ai_marketing.consent_updated"
    | "ai_marketing.opt_out_recorded"
    | "ai_marketing.export_generated";
  metadata?: Record<string, unknown>;
}) {
  await getPrisma().auditLog.create({
    data: {
      businessId: access.businessId,
      actorId: access.userId,
      action,
      message: aiMarketingAuditMessage(action),
      metadata: {
        feature: "phase3h_ai_marketing",
        role: access.role,
        ...metadata,
      } as Prisma.InputJsonObject,
    },
  }).catch(() => undefined);
}

export function aiMarketingCapabilityPayload(access: AiMarketingAccess) {
  return {
    canRead: access.canRead,
    canCreate: access.canCreate,
    canApprove: access.canApprove,
    canSend: access.canSend,
    canExport: access.canExport,
    canManageConsent: access.canManageConsent,
  };
}

function readDate(value: string | null, fallback: Date) {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function aiMarketingAuditMessage(action: string) {
  if (action === "ai_marketing.segment_viewed") {
    return "AI Marketing segment viewed.";
  }

  if (action === "ai_marketing.campaign_created") {
    return "AI Marketing campaign created.";
  }

  if (action === "ai_marketing.draft_generated") {
    return "AI Marketing draft generated.";
  }

  if (action === "ai_marketing.content_edited") {
    return "AI Marketing content edited.";
  }

  if (action === "ai_marketing.campaign_approved") {
    return "AI Marketing campaign approved.";
  }

  if (action === "ai_marketing.sending_attempted") {
    return "AI Marketing sending attempted.";
  }

  if (action === "ai_marketing.consent_updated") {
    return "AI Marketing consent updated.";
  }

  if (action === "ai_marketing.opt_out_recorded") {
    return "AI Marketing opt-out recorded.";
  }

  return "AI Marketing export generated.";
}
