import { z } from "zod";
import { assertSameOriginRequest } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { bankReconciliationErrorResponse } from "@/lib/bank-reconciliation/api";
import { requireBankReconciliationAccess } from "@/lib/bank-reconciliation/authorization";
import { reopenBankReconciliationEntry } from "@/lib/bank-reconciliation/service";

export const runtime = "nodejs";

const reopenRequestSchema = z.object({
  businessId: z.preprocess((val) => val ?? "", z.string().trim().min(1, "Choose a business.")),
  reason: z.preprocess((val) => val ?? "", z.string().trim().max(500)).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "bank_reconciliation.reopen_entry", 80, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const { id } = await params;
    const body = await parseJsonBody(request, reopenRequestSchema);
    const access = await requireBankReconciliationAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: "bank_reconciliation:review",
    });
    const result = await reopenBankReconciliationEntry({
      businessId: access.businessId,
      userId: user.id,
      entryId: id,
      reason: body.reason || undefined,
    });

    return Response.json({ result, message: "Bank statement entry reopened." });
  } catch (error) {
    return bankReconciliationErrorResponse(error, "Could not reopen bank statement entry.");
  }
}
