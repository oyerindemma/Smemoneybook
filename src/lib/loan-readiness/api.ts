import { Prisma } from "@prisma/client";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import {
  LoanReadinessAccessError,
  type LoanReadinessAccess,
} from "@/lib/loan-readiness/authorization";
import { LoanReadinessServiceError } from "@/lib/loan-readiness/service";
import { getPrisma } from "@/lib/prisma";

export function parseLoanReadinessRequest(url: string) {
  const searchParams = new URL(url).searchParams;
  const businessId = searchParams.get("businessId")?.trim() ?? "";

  if (!businessId) {
    throw new LoanReadinessAccessError("Choose a business.", 400, "business_required");
  }

  const rawLimit = Number(searchParams.get("limit") ?? 20);

  return {
    businessId,
    locationId: optionalText(searchParams.get("locationId")),
    snapshotId: optionalText(searchParams.get("snapshotId")),
    limit: Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 50 ? rawLimit : 20,
  };
}

export function loanReadinessErrorResponse(error: unknown, fallback: string) {
  if (error instanceof LoanReadinessAccessError || error instanceof LoanReadinessServiceError) {
    return jsonError(error.message, error.status);
  }

  if (error instanceof Response) {
    return jsonError(error.statusText || "Sign in to continue.", error.status);
  }

  console.error("loan_readiness.request_failed", error);
  return jsonErrorFromUnknown(error, fallback);
}

export function loanReadinessMethodNotAllowed(allow = "GET") {
  return Response.json(
    { error: "Method not allowed." },
    { status: 405, headers: { Allow: allow } },
  );
}

export async function logLoanReadinessEvent({
  access,
  action,
  metadata = {},
}: {
  access: LoanReadinessAccess;
  action:
    | "loan_readiness.report_viewed"
    | "loan_readiness.assessment_generated"
    | "loan_readiness.report_exported"
    | "loan_readiness.profile_updated";
  metadata?: Record<string, unknown>;
}) {
  await getPrisma().auditLog.create({
    data: {
      businessId: access.businessId,
      actorId: access.userId,
      action,
      message: auditMessage(action),
      metadata: {
        feature: "phase3g_loan_readiness",
        locationId: access.locationId ?? null,
        ...metadata,
      } as Prisma.InputJsonObject,
    },
  }).catch(() => undefined);
}

function auditMessage(action: string) {
  if (action === "loan_readiness.assessment_generated") return "Loan Readiness assessment generated.";
  if (action === "loan_readiness.report_exported") return "Loan Readiness report exported.";
  if (action === "loan_readiness.profile_updated") return "Loan Readiness profile updated.";
  return "Loan Readiness report viewed.";
}

function optionalText(value: string | null) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
