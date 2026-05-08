import { requireUser } from "@/lib/auth/session";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import {
  onboardingSetupRequestSchema,
  parseJsonBody,
  RequestValidationError,
} from "@/lib/api/validation";
import {
  createBusinessForUser,
  getDashboardState,
  getFirstBusinessForUser,
} from "@/lib/bookkeeping/persistence";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { businessName, businessType } = await parseJsonBody(
      request,
      onboardingSetupRequestSchema,
    );
    const existingBusiness = await getFirstBusinessForUser(user.id);

    if (!existingBusiness) {
      const business = await createBusinessForUser(user.id, businessName, {
        businessType,
        onboardingCompleted: true,
      });
      return Response.json({
        state: await getDashboardState(business.id, "OWNER", user.id),
      });
    }

    await getPrisma().business.update({
      where: { id: existingBusiness.id },
      data: {
        name: businessName,
        businessType,
        onboardingCompleted: true,
      },
    });

    return Response.json({
      state: await getDashboardState(
        existingBusiness.id,
        existingBusiness.role,
        user.id,
      ),
    });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    if (error instanceof RequestValidationError) {
      return jsonError(error.message, 400);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Couldn’t save. Try again.");
  }
}
