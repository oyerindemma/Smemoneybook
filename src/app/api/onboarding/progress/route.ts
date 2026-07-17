import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import {
  onboardingProgressRequestSchema,
  parseJsonBody,
  RequestValidationError,
} from "@/lib/api/validation";
import { requireBusinessAccess } from "@/lib/operations/access";
import { requirePhase1Feature } from "@/lib/phase1/feature-flags";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    const disabled = requirePhase1Feature("onboarding", "Progressive onboarding");
    if (disabled) {
      return disabled;
    }

    const user = await requireUser();
    const progress = await getPrisma().onboardingProgress.findUnique({
      where: { userId: user.id },
    });

    return Response.json({
      progress: progress
        ? {
            businessId: progress.businessId,
            currentStep: progress.currentStep,
            goal: progress.goal,
            data: progress.data,
            completedAt: progress.completedAt?.toISOString(),
            skippedAt: progress.skippedAt?.toISOString(),
          }
        : null,
    });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    return jsonError("Could not load onboarding progress.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const disabled = requirePhase1Feature("onboarding", "Progressive onboarding");
    if (disabled) {
      return disabled;
    }

    assertSameOriginRequest(request);
    const user = await requireUser();
    const body = await parseJsonBody(request, onboardingProgressRequestSchema);
    const access = body.businessId
      ? await requireBusinessAccess(user.id, undefined, body.businessId)
      : null;
    const businessId = access?.businessId;
    const completedAt = body.completed ? new Date() : undefined;
    const skippedAt = body.skipped ? new Date() : undefined;
    const eventName =
      body.eventName ||
      (body.completed
        ? "onboarding_completed"
        : body.skipped
          ? "onboarding_skipped"
          : undefined);

    await getPrisma().$transaction(async (tx) => {
      await tx.onboardingProgress.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          businessId,
          currentStep: body.step,
          goal: body.goal,
          data: body.data as Prisma.InputJsonValue | undefined,
          completedAt,
          skippedAt,
        },
        update: {
          businessId,
          currentStep: body.step,
          goal: body.goal,
          data: body.data as Prisma.InputJsonValue | undefined,
          completedAt,
          skippedAt,
        },
      });

      if ((body.completed || body.skipped) && businessId) {
        await tx.business.update({
          where: { id: businessId },
          data: { onboardingCompleted: true },
        });
      }

      if (eventName) {
        await tx.onboardingEvent.create({
          data: {
            userId: user.id,
            businessId,
            name: eventName,
            step: body.step,
            metadata: body.data as Prisma.InputJsonValue | undefined,
          },
        });
      }
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    if (error instanceof RequestValidationError) {
      return jsonError(error.message, 400);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not save onboarding progress.");
  }
}
