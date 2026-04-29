import { requireUser } from "@/lib/auth/session";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { collectDebtRequestSchema, parseJsonBody } from "@/lib/api/validation";
import { collectDebtForUser } from "@/lib/bookkeeping/persistence";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(request, collectDebtRequestSchema);

    const state = await collectDebtForUser({
      userId: user.id,
      debtId: id,
      accountId: body.accountId,
      idempotencyKey: body.idempotencyKey || crypto.randomUUID(),
    });

    return Response.json({ state });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not collect this money.");
  }
}
