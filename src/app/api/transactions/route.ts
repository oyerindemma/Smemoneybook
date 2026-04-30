import { requireUser } from "@/lib/auth/session";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import {
  parseJsonBody,
  RequestValidationError,
  transactionRequestSchema,
} from "@/lib/api/validation";
import {
  getDashboardStateForUser,
  recordPersistentTransaction,
} from "@/lib/bookkeeping/persistence";
import { logApiFailure } from "@/lib/operations/monitoring";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const state = await getDashboardStateForUser(user.id);

    if (!state) {
      return jsonError("Create a business to see activity.", 404);
    }

    return Response.json({ transactions: state.transactions });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonError("Could not load your activity.", 500);
  }
}

export async function POST(request: Request) {
  let userId: string | undefined;

  try {
    const user = await requireUser();
    userId = user.id;
    const body = await parseJsonBody(request, transactionRequestSchema);

    const state = await recordPersistentTransaction({
      userId: user.id,
      businessId: body.businessId,
      input: {
        idempotencyKey: body.idempotencyKey || crypto.randomUUID(),
        type: body.type,
        amount: body.amount,
        accountId: body.accountId,
        destinationAccountId: body.destinationAccountId,
        description: body.description,
        category: body.category,
        paymentStatus: body.paymentStatus,
        partyName: body.partyName,
        partyPhone: body.partyPhone,
        inventoryItemId: body.inventoryItemId,
        inventoryQuantity: body.inventoryQuantity,
        costOfGoods: body.costOfGoods,
        occurredAt: body.occurredAt,
        dueAt: body.dueAt,
      },
    });

    return Response.json({ state }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    if (!(error instanceof RequestValidationError)) {
      console.error(error);
      await logApiFailure({ request, error, actorId: userId });
    }
    return jsonErrorFromUnknown(error, "Could not save this entry.");
  }
}
