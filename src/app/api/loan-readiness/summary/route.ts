import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { requireLoanReadinessAccess } from "@/lib/loan-readiness/authorization";
import {
  loanReadinessErrorResponse,
  loanReadinessMethodNotAllowed,
  logLoanReadinessEvent,
  parseLoanReadinessRequest,
} from "@/lib/loan-readiness/api";
import { calculateLoanReadinessReport } from "@/lib/loan-readiness/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "loan_readiness.summary", 80, 15 * 60 * 1000);
    if (limited) return limited;

    const filters = parseLoanReadinessRequest(request.url);
    const access = await requireLoanReadinessAccess({
      userId: user.id,
      businessId: filters.businessId,
      locationId: filters.locationId,
      permission: "loan_readiness:read",
    });
    const report = await calculateLoanReadinessReport({
      businessId: access.businessId,
      locationId: access.locationId,
    });
    await logLoanReadinessEvent({
      access,
      action: "loan_readiness.report_viewed",
      metadata: { formulaVersion: report.formulaVersion },
    });

    return Response.json({ report, capabilities: access.capabilities });
  } catch (error) {
    return loanReadinessErrorResponse(error, "Could not load Loan Readiness.");
  }
}

export const POST = () => loanReadinessMethodNotAllowed("GET");
export const PUT = () => loanReadinessMethodNotAllowed("GET");
export const PATCH = () => loanReadinessMethodNotAllowed("GET");
export const DELETE = () => loanReadinessMethodNotAllowed("GET");
