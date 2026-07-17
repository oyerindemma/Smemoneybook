import { requireUser } from "@/lib/auth/session";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
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
import { phase1FeatureFlags } from "@/lib/phase1/feature-flags";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const { businessName, businessType, businessCategory, country, currency, mainGoal } = await parseJsonBody(
      request,
      onboardingSetupRequestSchema,
    );
    const existingBusiness = await getFirstBusinessForUser(user.id);
    const useProgressiveOnboarding = phase1FeatureFlags.onboarding;

    if (!existingBusiness) {
      const business = await createBusinessForUser(user.id, businessName, {
        businessType,
        businessCategory,
        country,
        currency,
        onboardingCompleted: !useProgressiveOnboarding,
      });
      if (!useProgressiveOnboarding) {
        return Response.json({
          state: await getDashboardState(business.id, "OWNER", user.id),
        });
      }

      await getPrisma().onboardingProgress.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          businessId: business.id,
          currentStep: "business_profile",
          goal: mainGoal,
          data: { businessCategory, country, currency, businessType },
        },
        update: {
          businessId: business.id,
          currentStep: "business_profile",
          goal: mainGoal,
          data: { businessCategory, country, currency, businessType },
        },
      });
      await getPrisma().onboardingEvent.create({
        data: {
          userId: user.id,
          businessId: business.id,
          name: "business_profile_completed",
          step: "business_profile",
          metadata: { businessCategory, country, currency, businessType, mainGoal },
        },
      });
      return Response.json({
        state: await getDashboardState(business.id, "OWNER", user.id),
      });
    }

    await getPrisma().business.update({
      where: { id: existingBusiness.id },
      data: {
        name: businessName,
        businessCategory,
        businessType,
        country,
        currency,
        onboardingCompleted: !useProgressiveOnboarding,
      },
    });
    if (!useProgressiveOnboarding) {
      return Response.json({
        state: await getDashboardState(
          existingBusiness.id,
          existingBusiness.role,
          user.id,
        ),
      });
    }

    await getPrisma().onboardingProgress.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        businessId: existingBusiness.id,
        currentStep: "business_profile",
        goal: mainGoal,
        data: { businessCategory, country, currency, businessType },
      },
      update: {
        businessId: existingBusiness.id,
        currentStep: "business_profile",
        goal: mainGoal,
        data: { businessCategory, country, currency, businessType },
      },
    });
    await getPrisma().onboardingEvent.create({
      data: {
        userId: user.id,
        businessId: existingBusiness.id,
        name: "business_profile_completed",
        step: "business_profile",
        metadata: { businessCategory, country, currency, businessType, mainGoal },
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
