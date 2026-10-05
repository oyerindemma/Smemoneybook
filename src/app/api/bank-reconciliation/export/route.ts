import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import {
  bankReconciliationErrorResponse,
  parseBankReconciliationListRequest,
} from "@/lib/bank-reconciliation/api";
import { requireBankReconciliationAccess } from "@/lib/bank-reconciliation/authorization";
import { exportBankReconciliation } from "@/lib/bank-reconciliation/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "bank_reconciliation.export", 20, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseBankReconciliationListRequest(request.url);
    const access = await requireBankReconciliationAccess({
      userId: user.id,
      businessId: filters.businessId,
      permission: "bank_reconciliation:export",
    });
    const result = await exportBankReconciliation({
      businessId: access.businessId,
      userId: user.id,
      importId: filters.importId,
      status: filters.status,
      duplicateStatus: filters.duplicateStatus,
      query: filters.query,
      from: filters.from,
      to: filters.to,
    });

    return new Response(result.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
      },
    });
  } catch (error) {
    return bankReconciliationErrorResponse(error, "Could not export bank reconciliation.");
  }
}
