import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { parseLoanReadinessRequest, loanReadinessErrorResponse, loanReadinessMethodNotAllowed } from "@/lib/loan-readiness/api";
import { requireLoanReadinessAccess } from "@/lib/loan-readiness/authorization";
import { calculateLoanReadinessReport } from "@/lib/loan-readiness/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "loan_readiness.evidence", 80, 15 * 60 * 1000);
    if (limited) return limited;
    const filters = parseLoanReadinessRequest(request.url);
    const access = await requireLoanReadinessAccess({
      userId: user.id,
      businessId: filters.businessId,
      locationId: filters.locationId,
      permission: "loan_readiness:read",
    });
    const report = await calculateLoanReadinessReport({ businessId: access.businessId, locationId: access.locationId });
    return Response.json({ evidence: report.evidence, disclaimer: report.disclaimer });
  } catch (error) {
    return loanReadinessErrorResponse(error, "Could not load Loan Readiness evidence.");
  }
}

export const POST = () => loanReadinessMethodNotAllowed("GET");
export const PUT = () => loanReadinessMethodNotAllowed("GET");
export const PATCH = () => loanReadinessMethodNotAllowed("GET");
export const DELETE = () => loanReadinessMethodNotAllowed("GET");
