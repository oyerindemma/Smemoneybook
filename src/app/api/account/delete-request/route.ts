import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { assertSameOriginRequest, jsonError } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
import { getPrisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api/error-middleware";

export const runtime = "nodejs";

const deleteRequestSchema = z.object({
  confirmation: z.preprocess((val) => val ?? "", z.string()).default(""),
  understood: z.boolean().default(false),
  reason: z.preprocess((val) => val ?? "", z.string().trim().max(500)).optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const payload = await parseJsonBody(request, deleteRequestSchema);
    const confirmation = payload.confirmation.trim();
    const understood = payload.understood;

    if (confirmation !== "DELETE") {
      return jsonError("Type DELETE to confirm.");
    }

    if (!understood) {
      return jsonError("Confirm that you understand this action may be permanent.");
    }

    const prisma = getPrisma();
    const existing = await prisma.accountDeletionRequest.findFirst({
      where: {
        userId: user.id,
        status: {
          in: ["pending", "processing"],
        },
      },
      select: { id: true },
    });

    if (existing) {
      return jsonError("You already have a pending deletion request.", 409);
    }

    const reason = payload.reason?.trim();

    await prisma.accountDeletionRequest.create({
      data: {
        userId: user.id,
        email: user.email,
        reason: reason || undefined,
        metadata: {
          source: "in_app_settings",
          userAgent: request.headers.get("user-agent")?.slice(0, 240) ?? null,
        },
      },
    });

    return Response.json({
      message: "Your account deletion request has been submitted.",
    });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    return handleApiError(request, error, "Something went wrong. Try again.");
  }
}
