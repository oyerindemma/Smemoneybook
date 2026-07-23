import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import {
  bankReconciliationErrorResponse,
  parseBankReconciliationImportRequest,
} from "@/lib/bank-reconciliation/api";
import { requireBankReconciliationAccess } from "@/lib/bank-reconciliation/authorization";
import { getBankReconciliationEntry } from "@/lib/bank-reconciliation/service";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "bank_reconciliation.entry", 120, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const { id } = await params;
    const filters = parseBankReconciliationImportRequest(request.url);
    const access = await requireBankReconciliationAccess({
      userId: user.id,
      businessId: filters.businessId,
      permission: "bank_reconciliation:read",
    });
    const entry = await getBankReconciliationEntry({
      businessId: access.businessId,
      entryId: id,
    });

    if (!entry) {
      return Response.json({ error: "Bank statement entry was not found." }, { status: 404 });
    }

    return Response.json({ entry });
  } catch (error) {
    return bankReconciliationErrorResponse(error, "Could not load bank statement entry.");
  }
}
