import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { requireBusinessAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

const actionRequestSchema = z.object({
  businessId: z.string().min(1),
  actionId: z.string().optional(),
  type: z.string().min(1).optional(),
  payload: z.unknown().optional(),
  decision: z.enum(["approve", "reject"]).optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const body = actionRequestSchema.parse(await request.json().catch(() => ({})));
    const access = await requireBusinessAccess(user.id, "money:write", body.businessId);

    if (!body.actionId) {
      const action = await getPrisma().pendingAssistantAction.create({
        data: {
          businessId: access.businessId,
          userId: user.id,
          type: body.type ?? "draft_action",
          payload: (body.payload ?? {}) as Prisma.InputJsonValue,
        },
      });
      return Response.json({ action });
    }

    const status = body.decision === "approve" ? "approved" : "rejected";
    const action = await getPrisma().pendingAssistantAction.updateMany({
      where: {
        id: body.actionId,
        businessId: access.businessId,
        userId: user.id,
        status: "pending",
      },
      data: { status },
    });

    return Response.json({
      ok: action.count > 0,
      message:
        status === "approved"
          ? "Action approved. Execution is not enabled for mutations yet."
          : "Action rejected.",
    });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("assistant.action_failed", error);
    return jsonErrorFromUnknown(error, "Could not update this assistant action.");
  }
}
