import { requireUser } from "@/lib/auth/session";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { parseJsonBody, remindDebtRequestSchema } from "@/lib/api/validation";
import { remindDebtForUser } from "@/lib/bookkeeping/persistence";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(request, remindDebtRequestSchema);
    const result = await remindDebtForUser({
      userId: user.id,
      businessId: body.businessId,
      debtId: id,
      channel: body.channel,
      note: body.note,
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not note reminder.");
  }
}
