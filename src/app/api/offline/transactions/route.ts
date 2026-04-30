import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { offlineTransactionsRequestSchema, parseJsonBody } from "@/lib/api/validation";
import { requireBusinessAccess } from "@/lib/operations/access";
import { recordPersistentTransaction } from "@/lib/bookkeeping/persistence";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await parseJsonBody(request, offlineTransactionsRequestSchema);
    const access = await requireBusinessAccess(user.id, "money:write", body.businessId);
    const results = [];

    for (const capture of body.captures) {
      await getPrisma().offlineCapture.upsert({
        where: {
          businessId_clientId: {
            businessId: access.businessId,
            clientId: capture.clientId,
          },
        },
        create: {
          businessId: access.businessId,
          actorId: user.id,
          clientId: capture.clientId,
          payload: capture.transaction as Prisma.JsonObject,
        },
        update: {},
      });

      try {
        await recordPersistentTransaction({
          userId: user.id,
          businessId: access.businessId,
          input: {
            ...capture.transaction,
            idempotencyKey: capture.transaction.idempotencyKey || `offline-${capture.clientId}`,
          },
        });
        await getPrisma().offlineCapture.update({
          where: {
            businessId_clientId: {
              businessId: access.businessId,
              clientId: capture.clientId,
            },
          },
          data: { status: "processed", processedAt: new Date(), error: null },
        });
        results.push({ clientId: capture.clientId, status: "processed" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not process offline entry.";
        await getPrisma().offlineCapture.update({
          where: {
            businessId_clientId: {
              businessId: access.businessId,
              clientId: capture.clientId,
            },
          },
          data: { status: "failed", error: message },
        });
        results.push({ clientId: capture.clientId, status: "failed", error: message });
      }
    }

    return Response.json({ results });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not sync offline entries.");
  }
}
