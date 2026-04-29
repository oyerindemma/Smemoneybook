import { createSession } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { databaseErrorMessage, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { loginRequestSchema, parseJsonBody } from "@/lib/api/validation";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { email, password } = await parseJsonBody(request, loginRequestSchema);

    const user = await getPrisma().user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.password))) {
      return jsonError("Email or password is not correct.", 401);
    }

    await createSession(user.id);

    return Response.json({
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (error) {
    console.error(error);
    const setupMessage = databaseErrorMessage(error);
    return setupMessage
      ? jsonError(setupMessage, 503)
      : jsonErrorFromUnknown(error, "Could not sign you in right now.");
  }
}
