import { requireUser } from "@/lib/auth/session";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import {
  parseJsonBody,
  settleSupplierDebtRequestSchema,
} from "@/lib/api/validation";
import { settleSupplierDebtForUser } from "@/lib/bookkeeping/persistence";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(request, settleSupplierDebtRequestSchema);
    const state = await settleSupplierDebtForUser({
      userId: user.id,
      businessId: body.businessId,
      debtId: id,
      accountId: body.accountId,
      idempotencyKey: body.idempotencyKey || crypto.randomUUID(),
      amount: body.amount,
    });

    return Response.json({ state });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not settle this supplier bill.");
  }
}
