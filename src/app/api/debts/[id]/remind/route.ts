import { requireUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api/http";
import { remindDebtForUser } from "@/lib/bookkeeping/persistence";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const result = await remindDebtForUser({ userId: user.id, debtId: id });

    return Response.json(result);
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonError(error instanceof Error ? error.message : "Could not note reminder.", 500);
  }
}
