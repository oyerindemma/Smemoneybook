import { requireUser } from "@/lib/auth/session";
import { assertSameOriginRequest, jsonError } from "@/lib/api/http";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

type DeleteRequestPayload = {
  confirmation?: unknown;
  understood?: unknown;
  reason?: unknown;
};

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const payload = (await request.json().catch(() => null)) as DeleteRequestPayload | null;
    const confirmation = typeof payload?.confirmation === "string" ? payload.confirmation.trim() : "";
    const understood = payload?.understood === true;

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

    const reason = typeof payload?.reason === "string" ? payload.reason.trim().slice(0, 500) : undefined;

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

    console.error(error);
    return jsonError("Something went wrong. Try again.", 500);
  }
}
