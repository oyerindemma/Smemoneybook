import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
import { requireMinimumPlan } from "@/lib/billing/subscriptions";
import { requireBusinessAccess, requireLocationAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";
import { requirePhase3Feature } from "@/lib/phase3/feature-flags";
import {
  calculateLoanReadinessForBusiness,
  recordLoanReadinessSharingConsent,
  saveLoanReadinessSnapshot,
} from "@/lib/phase3/loan-readiness-service";

export const runtime = "nodejs";

const snapshotRequestSchema = z.object({
  businessId: z.preprocess((val) => val ?? "", z.string().min(1, "Choose a business.")),
  locationId: z.preprocess((val) => val ?? "", z.string().trim()).optional(),
  recalculatedFromId: z.preprocess((val) => val ?? "", z.string().trim()).optional(),
});

const sharingConsentSchema = z.object({
  businessId: z.preprocess((val) => val ?? "", z.string().min(1, "Choose a business.")),
  snapshotId: z.preprocess((val) => val ?? "", z.string().trim()).optional(),
  partnerName: z.string().trim().min(2, "Enter the partner name."),
  purpose: z.string().trim().min(5, "Enter the sharing purpose."),
  consentText: z.string().trim().min(20, "Record the consent text shown to the user."),
  consentConfirmed: z.boolean(),
});

export async function GET(request: Request) {
  try {
    const featureGate = requirePhase3Feature("loanReadiness", "Loan readiness");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const limited = await enforceRateLimit(request, "loan_readiness.read", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get("businessId") ?? undefined;
    const locationId = searchParams.get("locationId") ?? undefined;
    const access = await requireBusinessAccess(user.id, "reports:write", businessId);
    const resolvedLocationId = locationId
      ? (await requireLocationAccess({
          userId: user.id,
          businessId: access.businessId,
          locationId,
          permission: "reports:write",
        })).locationId
      : undefined;
    const planGate = await requireMinimumPlan(
      user.id,
      access.businessId,
      "growth",
      "Upgrade to Growth to use Loan Readiness.",
    );

    if (planGate) {
      return planGate;
    }

    const assessment = await calculateLoanReadinessForBusiness({
      businessId: access.businessId,
      locationId: resolvedLocationId,
    });

    return Response.json({ assessment });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("loan_readiness.read_failed", error);
    return jsonErrorFromUnknown(error, "Could not calculate loan readiness.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const featureGate = requirePhase3Feature("loanReadiness", "Loan readiness");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const body = await parseJsonBody(request, snapshotRequestSchema);
    const limited = await enforceRateLimit(request, "loan_readiness.write", 30, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireBusinessAccess(user.id, "reports:write", body.businessId);
    const resolvedLocationId = body.locationId
      ? (await requireLocationAccess({
          userId: user.id,
          businessId: access.businessId,
          locationId: body.locationId,
          permission: "reports:write",
        })).locationId
      : undefined;
    const planGate = await requireMinimumPlan(
      user.id,
      access.businessId,
      "growth",
      "Upgrade to Growth to save Loan Readiness snapshots.",
    );

    if (planGate) {
      return planGate;
    }

    const assessment = await calculateLoanReadinessForBusiness({
      businessId: access.businessId,
      locationId: resolvedLocationId,
    });
    const snapshot = await saveLoanReadinessSnapshot({
      assessment,
      recalculatedFromId: body.recalculatedFromId || undefined,
    });

    await getPrisma().auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: user.id,
        action: "loan_readiness.snapshot_saved",
        message: "Loan readiness snapshot saved.",
        metadata: {
          feature: "phase3g_loan_readiness",
          snapshotId: snapshot.id,
          formulaVersion: assessment.formulaVersion,
          score: assessment.score,
          rating: assessment.rating,
          confidence: assessment.confidence,
          locationId: resolvedLocationId,
        } as Prisma.InputJsonObject,
      },
    });

    return Response.json({ assessment, snapshotId: snapshot.id, message: "Loan readiness snapshot saved." });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("loan_readiness.write_failed", error);
    return jsonErrorFromUnknown(error, "Could not save loan readiness.");
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOriginRequest(request);
    const featureGate = requirePhase3Feature("loanReadiness", "Loan readiness");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const body = await parseJsonBody(request, sharingConsentSchema);
    const limited = await enforceRateLimit(request, "loan_readiness.share", 20, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    if (!body.consentConfirmed) {
      return jsonError("Consent must be confirmed before logging readiness sharing.", 400);
    }

    const access = await requireBusinessAccess(user.id, "reports:write", body.businessId);
    const planGate = await requireMinimumPlan(
      user.id,
      access.businessId,
      "growth",
      "Upgrade to Growth to record Loan Readiness sharing consent.",
    );

    if (planGate) {
      return planGate;
    }

    const sharingLog = await recordLoanReadinessSharingConsent({
      businessId: access.businessId,
      actorId: user.id,
      snapshotId: body.snapshotId || undefined,
      partnerName: body.partnerName,
      purpose: body.purpose,
      consentText: body.consentText,
      metadata: {
        feature: "phase3g_loan_readiness",
        externalSharePerformed: false,
      },
    });

    await getPrisma().auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: user.id,
        action: "loan_readiness.sharing_consent_recorded",
        message: "Loan readiness sharing consent recorded.",
        metadata: {
          feature: "phase3g_loan_readiness",
          sharingLogId: sharingLog.id,
          snapshotId: body.snapshotId || undefined,
          partnerName: body.partnerName,
          externalSharePerformed: false,
        } as Prisma.InputJsonObject,
      },
    });

    return Response.json({
      sharingLogId: sharingLog.id,
      message: "Loan readiness sharing consent recorded. No external sharing was performed.",
    });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("loan_readiness.share_failed", error);
    return jsonErrorFromUnknown(error, "Could not record loan readiness sharing consent.");
  }
}
