import { OfflineSyncStatus, Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import {
  offlineSyncOperationRequestSchema,
  offlineSyncOperationResolveRequestSchema,
  parseJsonBody,
} from "@/lib/api/validation";
import { requireBusinessAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get("businessId") ?? undefined;
    const access = await requireBusinessAccess(user.id, "money:write", businessId);
    const operations = await getPrisma().offlineSyncOperation.findMany({
      where: {
        businessId: access.businessId,
        status: { in: [OfflineSyncStatus.FAILED, OfflineSyncStatus.CONFLICT] },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        operationId: true,
        operationType: true,
        payload: true,
        status: true,
        retryCount: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return Response.json({
      operations: operations.map((operation) => ({
        id: operation.id,
        operationId: operation.operationId,
        operationType: operation.operationType,
        payload: operation.payload,
        status: operation.status.toLowerCase(),
        retryCount: operation.retryCount,
        lastError: operation.lastError,
        createdAt: operation.createdAt.toISOString(),
        updatedAt: operation.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not load offline sync status.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const body = await parseJsonBody(request, offlineSyncOperationRequestSchema);
    const permission =
      body.operationType === "stock" ? "inventory:write" : "money:write";
    const access = await requireBusinessAccess(user.id, permission, body.businessId);
    const status =
      body.status === "CONFLICT" ? OfflineSyncStatus.CONFLICT : OfflineSyncStatus.FAILED;
    const payload = body.payloadSummary as Prisma.InputJsonValue;

    await getPrisma().offlineSyncOperation.upsert({
      where: {
        businessId_operationId: {
          businessId: access.businessId,
          operationId: body.operationId,
        },
      },
      create: {
        businessId: access.businessId,
        actorId: user.id,
        operationId: body.operationId,
        operationType: body.operationType,
        payload,
        status,
        retryCount: body.retryCount,
        lastError: body.errorMessage,
      },
      update: {
        payload,
        status,
        retryCount: body.retryCount,
        lastError: body.errorMessage,
        nextRetryAt: null,
        syncedAt: null,
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not record offline sync status.");
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const body = await parseJsonBody(request, offlineSyncOperationResolveRequestSchema);
    const access = await requireBusinessAccess(user.id, "money:write", body.businessId);

    await getPrisma().offlineSyncOperation.updateMany({
      where: {
        businessId: access.businessId,
        operationId: body.operationId,
      },
      data: {
        status: OfflineSyncStatus.SYNCED,
        lastError: null,
        nextRetryAt: null,
        syncedAt: new Date(),
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not update offline sync status.");
  }
}
