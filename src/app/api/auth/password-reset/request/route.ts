import { createHash, randomBytes } from "node:crypto";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest, databaseErrorMessage, jsonErrorFromUnknown } from "@/lib/api/http";
import { parseJsonBody, passwordResetRequestSchema } from "@/lib/api/validation";
import { getPrisma } from "@/lib/prisma";
import { logApiFailure } from "@/lib/operations/monitoring";

export const runtime = "nodejs";

const resetTtlMs = 60 * 60 * 1000;

function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function getResetUrl(request: Request, token: string) {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const origin = configuredOrigin || new URL(request.url).origin;
  return `${origin}/reset-password?token=${encodeURIComponent(token)}`;
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const limited = await enforceRateLimit(request, "auth.password_reset.request", 5);
    if (limited) {
      return limited;
    }

    const { email } = await parseJsonBody(request, passwordResetRequestSchema);
    const user = await getPrisma().user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    let resetUrl: string | undefined;

    if (user) {
      const token = randomBytes(32).toString("hex");
      const tokenHash = hashResetToken(token);
      const expiresAt = new Date(Date.now() + resetTtlMs);

      await getPrisma().passwordResetToken.deleteMany({
        where: {
          userId: user.id,
          OR: [{ usedAt: { not: null } }, { expiresAt: { lt: new Date() } }],
        },
      });

      await getPrisma().passwordResetToken.create({
        data: {
          tokenHash,
          userId: user.id,
          expiresAt,
        },
      });

      resetUrl = getResetUrl(request, token);
      if (process.env.NODE_ENV !== "production") {
        console.info(`Password reset link for ${user.email}: ${resetUrl}`);
      }
    }

    return Response.json({
      message: "If that email is registered, we sent password reset instructions.",
      resetUrl: process.env.NODE_ENV === "production" ? undefined : resetUrl,
    });
  } catch (error) {
    console.error(error);
    await logApiFailure({ request, error });
    const setupMessage = databaseErrorMessage(error);
    return setupMessage
      ? Response.json({ error: setupMessage }, { status: 503 })
      : jsonErrorFromUnknown(error, "Could not start password reset right now.");
  }
}
