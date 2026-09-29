import { assertSameOriginRequest } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { logLoanReadinessEvent, loanReadinessErrorResponse, loanReadinessMethodNotAllowed } from "@/lib/loan-readiness/api";
import { requireLoanReadinessAccess } from "@/lib/loan-readiness/authorization";
import { calculateLoanReadinessReport, saveLoanReadinessReport } from "@/lib/loan-readiness/service";
import { loanReadinessGenerateSchema } from "@/lib/loan-readiness/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const body = await parseJsonBody(request, loanReadinessGenerateSchema);
    const limited = await enforceRateLimit(request, "loan_readiness.generate", 20, 60 * 60 * 1000);
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
      metadata: { snapshotId: snapshot.id, formulaVersion: report.formulaVersion, overallStatus: report.overallStatus },
    });

    return Response.json({ report, snapshotId: snapshot.id, message: "Loan Readiness assessment saved." }, { status: 201 });
  } catch (error) {
    return loanReadinessErrorResponse(error, "Could not generate Loan Readiness assessment.");
  }
}

export const GET = () => loanReadinessMethodNotAllowed("POST");
export const PUT = () => loanReadinessMethodNotAllowed("POST");
export const PATCH = () => loanReadinessMethodNotAllowed("POST");
export const DELETE = () => loanReadinessMethodNotAllowed("POST");
