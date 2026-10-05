import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import {
  parseJsonBody,
  RequestValidationError,
  transactionRequestSchema,
} from "@/lib/api/validation";
import {
  getDashboardStateForUser,
  recordPersistentTransaction,
} from "@/lib/bookkeeping/persistence";
import {
  requirePeopleAllowance,
  requireTransactionAllowance,
  willCreateBillablePerson,
} from "@/lib/billing/free-limits";
import { requireBusinessAccess } from "@/lib/operations/access";
import { logApiFailure } from "@/lib/operations/monitoring";
import { activateReferralRewards } from "@/lib/viral/referral-service";

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
    assertSameOriginRequest(request);
    const user = await requireUser();
    userId = user.id;
    const body = await parseJsonBody(request, transactionRequestSchema);
    const limited = await enforceRateLimit(request, "transactions.write", 120, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireBusinessAccess(user.id, "money:write", body.businessId);
    const recordGate = await requireTransactionAllowance(user.id, access.businessId);

    if (recordGate) {
      return recordGate;
    }

    if (willCreateBillablePerson(body)) {
      const peopleGate = await requirePeopleAllowance(user.id, access.businessId);

      if (peopleGate) {
        return peopleGate;
      }
    }

    const state = await recordPersistentTransaction({
      userId: user.id,
      businessId: body.businessId,
      input: {
        idempotencyKey: body.idempotencyKey || crypto.randomUUID(),
        locationId: body.locationId,
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
        invoiceItems: body.invoiceItems,
        costOfGoods: body.costOfGoods,
        occurredAt: body.occurredAt,
        dueAt: body.dueAt,
      },
    });

    void activateReferralRewards({ referredUserId: user.id }).catch((error) => {
      console.error("referral.activation_failed", error);
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
