import { z } from "zod";
import { assertSameOriginRequest, jsonError } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  loanReadinessErrorResponse,
  loanReadinessMethodNotAllowed,
  logLoanReadinessEvent,
  parseLoanReadinessRequest,
} from "@/lib/loan-readiness/api";
import { requireLoanReadinessAccess } from "@/lib/loan-readiness/authorization";
import {
  calculateLoanReadinessReport,
  saveLoanReadinessReport,
} from "@/lib/loan-readiness/service";
import { loanReadinessGenerateSchema } from "@/lib/loan-readiness/validation";
import { recordLoanReadinessSharingConsent } from "@/lib/phase3/loan-readiness-service";

export const runtime = "nodejs";

const sharingConsentSchema = z.object({
  businessId: z.string().trim().min(1, "Choose a business."),
  snapshotId: z.string().trim().optional(),
  partnerName: z.string().trim().min(2, "Enter the partner name.").max(120),
  purpose: z.string().trim().min(5, "Enter the sharing purpose.").max(300),
  consentText: z.string().trim().min(20, "Record the consent text shown to the user.").max(1_000),
  consentConfirmed: z.boolean(),
});

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "loan_readiness.compatibility.read", 60, 15 * 60 * 1000);
    if (limited) return limited;
    const filters = parseLoanReadinessRequest(request.url);
    const access = await requireLoanReadinessAccess({
      userId: user.id,
      businessId: filters.businessId,
      locationId: filters.locationId,
      permission: "loan_readiness:read",
    });
    const report = await calculateLoanReadinessReport({ businessId: access.businessId, locationId: access.locationId });
    return Response.json({ assessment: report, report, capabilities: access.capabilities });
  } catch (error) {
    return loanReadinessErrorResponse(error, "Could not calculate Loan Readiness.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const body = await parseJsonBody(request, loanReadinessGenerateSchema);
    const limited = await enforceRateLimit(request, "loan_readiness.compatibility.generate", 20, 60 * 60 * 1000);
    if (limited) return limited;
    const access = await requireLoanReadinessAccess({
      userId: user.id,
      businessId: body.businessId,
      locationId: body.locationId,
      permission: "loan_readiness:generate",
    });
    const report = await calculateLoanReadinessReport({ businessId: access.businessId, locationId: access.locationId });
    const snapshot = await saveLoanReadinessReport({
      report,
      generatedByUserId: user.id,
      recalculatedFromId: body.recalculatedFromId,
    });
    await logLoanReadinessEvent({
      access,
      action: "loan_readiness.assessment_generated",
      metadata: { snapshotId: snapshot.id, compatibilityRoute: true },
    });
    return Response.json({
      assessment: report,
      report,
      snapshotId: snapshot.id,
      message: "Loan Readiness assessment saved.",
    }, { status: 201 });
  } catch (error) {
    return loanReadinessErrorResponse(error, "Could not save Loan Readiness.");
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const body = await parseJsonBody(request, sharingConsentSchema);
    const limited = await enforceRateLimit(request, "loan_readiness.share", 20, 60 * 60 * 1000);
    if (limited) return limited;
    if (!body.consentConfirmed) {
      return jsonError("Consent must be confirmed before logging readiness sharing.", 400);
    }
    const access = await requireLoanReadinessAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: "loan_readiness:manage_profile",
    });
    const sharingLog = await recordLoanReadinessSharingConsent({
      businessId: access.businessId,
      actorId: user.id,
      snapshotId: body.snapshotId || undefined,
      partnerName: body.partnerName,
      purpose: body.purpose,
      consentText: body.consentText,
      metadata: { feature: "phase3g_loan_readiness", externalSharePerformed: false },
    });
    return Response.json({
      sharingLogId: sharingLog.id,
      message: "Loan Readiness sharing consent recorded. No external sharing was performed.",
    });
  } catch (error) {
    return loanReadinessErrorResponse(error, "Could not record Loan Readiness sharing consent.");
  }
}

export const PUT = () => loanReadinessMethodNotAllowed("GET, POST, PATCH");
export const DELETE = () => loanReadinessMethodNotAllowed("GET, POST, PATCH");
