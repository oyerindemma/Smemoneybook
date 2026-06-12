import { createHash } from "node:crypto";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { hashPassword } from "@/lib/auth/password";
import { assertSameOriginRequest, databaseErrorMessage, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { parseJsonBody, passwordResetConfirmSchema } from "@/lib/api/validation";
import { getPrisma } from "@/lib/prisma";
import { logApiFailure } from "@/lib/operations/monitoring";

export const runtime = "nodejs";

function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const limited = await enforceRateLimit(request, "auth.password_reset.confirm", 5);
    if (limited) {
      return limited;
    }

    const { token, password } = await parseJsonBody(request, passwordResetConfirmSchema);
    const tokenHash = hashResetToken(token);
    const resetToken = await getPrisma().passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) {
      return jsonError("This reset link has expired. Request a new one.", 400);
    }

    await getPrisma().$transaction([
      getPrisma().user.update({
        where: { id: resetToken.userId },
        data: { password: await hashPassword(password) },
      }),
      getPrisma().passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      getPrisma().session.deleteMany({
        where: { userId: resetToken.userId },
      }),
    ]);

    return Response.json({ message: "Your password has been updated. Sign in with your new password." });
  } catch (error) {
    console.error(error);
    await logApiFailure({ request, error });
    const setupMessage = databaseErrorMessage(error);
    return setupMessage
      ? jsonError(setupMessage, 503)
      : jsonErrorFromUnknown(error, "Could not reset password right now.");
  }
}
