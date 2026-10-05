import { Prisma } from "@prisma/client";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { getPrisma } from "@/lib/prisma";
import {
  TaxAssistantAccessError,
  type TaxAssistantAccess,
} from "@/lib/tax-assistant/authorization";
import type { TaxAssistantToolName } from "@/lib/tax-assistant/definitions";
import { resolveTaxPeriod } from "@/lib/tax-assistant/periods";

export class TaxAssistantDomainError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "tax_assistant_invalid") {
    super(message);
    this.name = "TaxAssistantDomainError";
    this.status = status;
    this.code = code;
  }
}

export function taxAssistantErrorResponse(error: unknown, fallback: string) {
  if (error instanceof TaxAssistantAccessError || error instanceof TaxAssistantDomainError) {
    return jsonError(error.message, error.status);
  }

  if (error instanceof Response) {
    return jsonError("Sign in to continue.", error.status);
  }

  console.error(error);
  return jsonErrorFromUnknown(error, fallback);
}

export function parseTaxAssistantRequest(url: string) {
  const searchParams = new URL(url).searchParams;
  const businessId = requiredParam(searchParams.get("businessId"), "Choose a business.");
  const locationId = optionalParam(searchParams.get("locationId"));
  const period = resolveTaxPeriod({
    month: searchParams.get("month"),
    year: searchParams.get("year"),
    quarter: searchParams.get("quarter"),
    frequency: searchParams.get("frequency"),
    from: searchParams.get("from"),
    to: searchParams.get("to"),
  });

  return {
    businessId,
    locationId,
    ...period,
  };
}

export function parseTaxAssistantListRequest(url: string) {
  const parsed = parseTaxAssistantRequest(url);
  const searchParams = new URL(url).searchParams;

  return {
    ...parsed,
    issueType: optionalParam(searchParams.get("issueType")),
    severity: optionalParam(searchParams.get("severity")),
    limit: Math.min(Math.max(Number(searchParams.get("limit") ?? 50), 1), 100),
  };
}

export async function logTaxAssistantEvent({
  access,
  action,
  message,
  periodStart,
  periodEnd,
  taxType,
  conversationId,
  toolNames,
  success = true,
  metadata,
}: {
  access: TaxAssistantAccess;
  action: string;
  message: string;
  periodStart?: Date;
  periodEnd?: Date;
  taxType?: string;
  conversationId?: string;
  toolNames?: TaxAssistantToolName[];
  success?: boolean;
  metadata?: Prisma.InputJsonObject;
}) {
  await getPrisma().auditLog.create({
    data: {
      businessId: access.businessId,
      actorId: access.userId,
      action,
      message,
      metadata: {
        feature: "phase3_tax_assistant",
        periodStart: periodStart?.toISOString() ?? null,
        periodEnd: periodEnd?.toISOString() ?? null,
        taxType: taxType ?? null,
        conversationId: conversationId ?? null,
        toolNames: toolNames ?? [],
        success,
        ...(metadata ?? {}),
      } as Prisma.InputJsonObject,
    },
  });
}

export function taxAssistantMethodNotAllowed(allow = "GET") {
  return Response.json(
    { error: "Tax Assistant is read-only for this endpoint." },
    {
      status: 405,
      headers: { Allow: allow },
    },
  );
}

function requiredParam(value: string | null, message: string) {
  const trimmed = optionalParam(value);

  if (!trimmed) {
    throw new TaxAssistantDomainError(message, 400, "missing_param");
  }

  return trimmed;
}

function optionalParam(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
