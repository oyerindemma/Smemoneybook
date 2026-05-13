import { createSession } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { hashPassword } from "@/lib/auth/password";
import { assertSameOriginRequest, databaseErrorMessage, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { parseJsonBody, registerRequestSchema } from "@/lib/api/validation";
import { createBusinessForUser } from "@/lib/bookkeeping/persistence";
import { getPrisma } from "@/lib/prisma";
import { logApiFailure } from "@/lib/operations/monitoring";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const limited = await enforceRateLimit(request, "auth.register", 5);
    if (limited) {
      return limited;
    }

    const { name, email, password, businessName } = await parseJsonBody(
      request,
      registerRequestSchema,
    );

    const existing = await getPrisma().user.findUnique({ where: { email } });
    if (existing) {
      return jsonError("Could not create your account with these details.", 400);
    }

    const user = await getPrisma().user.create({
      data: {
        name,
        email,
        password: await hashPassword(password),
      },
    });

    const business = businessName
      ? await createBusinessForUser(user.id, businessName)
      : null;

    await createSession(user.id, request);

    return Response.json({
      user: { id: user.id, name: user.name, email: user.email },
      business: business
        ? {
            id: business.id,
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
      : jsonErrorFromUnknown(error, "Could not create your account right now.");
  }
}
