import { assertSameOriginRequest } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { logLoanReadinessEvent, parseLoanReadinessRequest, loanReadinessErrorResponse, loanReadinessMethodNotAllowed } from "@/lib/loan-readiness/api";
import { requireLoanReadinessAccess } from "@/lib/loan-readiness/authorization";
import { getLoanReadinessProfile, updateLoanReadinessProfile } from "@/lib/loan-readiness/service";
import { loanReadinessProfileSchema } from "@/lib/loan-readiness/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "loan_readiness.profile.read", 60, 15 * 60 * 1000);
    if (limited) return limited;
    const filters = parseLoanReadinessRequest(request.url);
    const access = await requireLoanReadinessAccess({
      userId: user.id,
      businessId: filters.businessId,
      permission: "loan_readiness:read",
    });
    const profile = await getLoanReadinessProfile(access.businessId);
    return Response.json({ profile, capabilities: access.capabilities });
  } catch (error) {
    return loanReadinessErrorResponse(error, "Could not load the Loan Readiness profile.");
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const body = await parseJsonBody(request, loanReadinessProfileSchema);
    const limited = await enforceRateLimit(request, "loan_readiness.profile.write", 20, 60 * 60 * 1000);
    if (limited) return limited;
    const access = await requireLoanReadinessAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: "loan_readiness:manage_profile",
    });
    const profile = await updateLoanReadinessProfile({
      businessId: access.businessId,
      input: {
        industry: body.industry,
        operatingStartDate: body.operatingStartDate,
        fundingPurpose: body.fundingPurpose,
        requestedAmount: body.requestedAmount,
        preferredCurrency: body.preferredCurrency,
        consentToShare: body.consentToShare,
        documents: body.documents,
      },
    });
    await logLoanReadinessEvent({ access, action: "loan_readiness.profile_updated" });
    return Response.json({ profile, message: "Loan Readiness profile saved." });
  } catch (error) {
    return loanReadinessErrorResponse(error, "Could not save the Loan Readiness profile.");
  }
}

export const POST = () => loanReadinessMethodNotAllowed("GET, PUT");
export const PATCH = () => loanReadinessMethodNotAllowed("GET, PUT");
export const DELETE = () => loanReadinessMethodNotAllowed("GET, PUT");
