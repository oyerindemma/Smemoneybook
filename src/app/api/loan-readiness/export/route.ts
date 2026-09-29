import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { logLoanReadinessEvent, parseLoanReadinessRequest, loanReadinessErrorResponse, loanReadinessMethodNotAllowed } from "@/lib/loan-readiness/api";
import { requireLoanReadinessAccess } from "@/lib/loan-readiness/authorization";
import { buildLoanReadinessCsv } from "@/lib/loan-readiness/export";
import { calculateLoanReadinessReport } from "@/lib/loan-readiness/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "loan_readiness.export", 20, 60 * 60 * 1000);
    if (limited) return limited;
    const filters = parseLoanReadinessRequest(request.url);
    const access = await requireLoanReadinessAccess({
      userId: user.id,
      businessId: filters.businessId,
      locationId: filters.locationId,
      permission: "loan_readiness:export",
    });
    const report = await calculateLoanReadinessReport({ businessId: access.businessId, locationId: access.locationId });
    const csv = buildLoanReadinessCsv(report);
    await logLoanReadinessEvent({
      access,
      action: "loan_readiness.report_exported",
      metadata: { formulaVersion: report.formulaVersion },
    });
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="loan-readiness-${report.generatedAt.slice(0, 10)}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return loanReadinessErrorResponse(error, "Could not export Loan Readiness report.");
  }
}

export const POST = () => loanReadinessMethodNotAllowed("GET");
export const PUT = () => loanReadinessMethodNotAllowed("GET");
export const PATCH = () => loanReadinessMethodNotAllowed("GET");
export const DELETE = () => loanReadinessMethodNotAllowed("GET");
