import { z } from "zod";
import { assertSameOriginRequest } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { bankReconciliationErrorResponse } from "@/lib/bank-reconciliation/api";
import { requireBankReconciliationAccess } from "@/lib/bank-reconciliation/authorization";
import { confirmBankReconciliationMatch } from "@/lib/bank-reconciliation/service";

export const runtime = "nodejs";

const actionRequestSchema = z.object({
  businessId: z.preprocess((val) => val ?? "", z.string().trim().min(1, "Choose a business.")),
  notes: z.preprocess((val) => val ?? "", z.string().trim().max(500)).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "bank_reconciliation.confirm", 80, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const { id } = await params;
    const body = await parseJsonBody(request, actionRequestSchema);
    const access = await requireBankReconciliationAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: "bank_reconciliation:review",
    });
    const result = await confirmBankReconciliationMatch({
      businessId: access.businessId,
      userId: user.id,
      matchId: id,
      notes: body.notes || undefined,
    });

    return Response.json({ result, message: "Bank reconciliation match confirmed." });
  } catch (error) {
    return bankReconciliationErrorResponse(error, "Could not confirm bank reconciliation match.");
  }
}
