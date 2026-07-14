import { createSession } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { verifyPassword } from "@/lib/auth/password";
import { assertSameOriginRequest, databaseErrorMessage, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { loginRequestSchema, parseJsonBody } from "@/lib/api/validation";
import { getFirstBusinessForUser } from "@/lib/bookkeeping/persistence";
import { getPrisma } from "@/lib/prisma";
import { logApiFailure } from "@/lib/operations/monitoring";
import { sanitizeString } from "@/lib/utils/sanitize";

export const runtime = "nodejs";

function isPinCredential(value: string) {
  return /^\d{6}$/.test(value);
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const limited = await enforceRateLimit(request, "auth.login");
    if (limited) {
      return limited;
    }

    const { email, password } = await parseJsonBody(request, loginRequestSchema);

    const user = await getPrisma().user.findUnique({ where: { email } });
    const isPasswordMatch = user ? await verifyPassword(password, user.password) : false;
    const isPinMatch = user?.pinHash && isPinCredential(password)
      ? await verifyPassword(password, user.pinHash)
      : false;

    if (!user || (!isPasswordMatch && !isPinMatch)) {
      return jsonError("Email or password/PIN is not correct.", 401);
    }

    await createSession(user.id, request);
    const business = await getFirstBusinessForUser(user.id);

    return Response.json({
      user: {
        id: sanitizeString(user.id),
        name: sanitizeString(user.name),
        email: sanitizeString(user.email),
      },
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
