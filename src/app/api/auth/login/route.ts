import { createSession } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { verifyPassword } from "@/lib/auth/password";
import { databaseErrorMessage, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { loginRequestSchema, parseJsonBody } from "@/lib/api/validation";
import { getFirstBusinessForUser } from "@/lib/bookkeeping/persistence";
import { getPrisma } from "@/lib/prisma";
import { logApiFailure } from "@/lib/operations/monitoring";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const limited = await enforceRateLimit(request, "auth.login");
    if (limited) {
      return limited;
    }

    const { email, password } = await parseJsonBody(request, loginRequestSchema);

    const user = await getPrisma().user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.password))) {
      return jsonError("Email or password is not correct.", 401);
    }

    await createSession(user.id, request);
    const business = await getFirstBusinessForUser(user.id);

    return Response.json({
      user: { id: user.id, name: user.name, email: user.email },
      business: business
        ? {
            id: business.businessId,
            name: business.name,
            businessType: business.businessType,
            onboardingCompleted: business.onboardingCompleted,
          }
        : null,
    });
  } catch (error) {
    console.error(error);
    await logApiFailure({ request, error });
    const setupMessage = databaseErrorMessage(error);
    return setupMessage
      ? jsonError(setupMessage, 503)
      : jsonErrorFromUnknown(error, "Could not sign you in right now.");
  }
}
