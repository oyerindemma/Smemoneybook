import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import {
  bankReconciliationErrorResponse,
  parseBankReconciliationListRequest,
} from "@/lib/bank-reconciliation/api";
import { requireBankReconciliationAccess } from "@/lib/bank-reconciliation/authorization";
import { listBankReconciliationEntries } from "@/lib/bank-reconciliation/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "bank_reconciliation.entries", 120, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseBankReconciliationListRequest(request.url);
    const access = await requireBankReconciliationAccess({
      userId: user.id,
      businessId: filters.businessId,
      permission: "bank_reconciliation:read",
    });
    const result = await listBankReconciliationEntries({
      ...filters,
      businessId: access.businessId,
    });

    return Response.json(result);
  } catch (error) {
    return bankReconciliationErrorResponse(error, "Could not load bank statement entries.");
  }
}
