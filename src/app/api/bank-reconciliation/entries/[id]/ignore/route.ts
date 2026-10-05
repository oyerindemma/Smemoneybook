import { z } from "zod";
import { assertSameOriginRequest } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { bankReconciliationErrorResponse } from "@/lib/bank-reconciliation/api";
import { requireBankReconciliationAccess } from "@/lib/bank-reconciliation/authorization";
import { ignoreBankReconciliationEntry } from "@/lib/bank-reconciliation/service";

export const runtime = "nodejs";

const ignoreRequestSchema = z.object({
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
    const limited = await enforceRateLimit(request, "bank_reconciliation.ignore", 80, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const { id } = await params;
    const body = await parseJsonBody(request, ignoreRequestSchema);
    const access = await requireBankReconciliationAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: "bank_reconciliation:ignore",
    });
    const result = await ignoreBankReconciliationEntry({
      businessId: access.businessId,
      userId: user.id,
      entryId: id,
      reason: body.reason || undefined,
    });

    return Response.json({ result, message: "Bank statement entry ignored." });
  } catch (error) {
    return bankReconciliationErrorResponse(error, "Could not ignore bank statement entry.");
  }
}
