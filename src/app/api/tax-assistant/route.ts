import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
import { requireFeatureAccess, requireMinimumPlan } from "@/lib/billing/subscriptions";
import { requireBusinessAccess, requireLocationAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";
import { requirePhase3Feature } from "@/lib/phase3/feature-flags";
import {
  calculateTaxAssistantForBusiness,
  saveTaxAssistantSnapshot,
} from "@/lib/phase3/tax-assistant-service";

export const runtime = "nodejs";

const snapshotRequestSchema = z.object({
  businessId: z.preprocess((val) => val ?? "", z.string().min(1, "Choose a business.")),
  locationId: z.preprocess((val) => val ?? "", z.string().trim()).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  recalculatedFromId: z.preprocess((val) => val ?? "", z.string().trim()).optional(),
});

export async function GET(request: Request) {
  try {
    const featureGate = requirePhase3Feature("taxAssistant", "Tax assistant");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const limited = await enforceRateLimit(request, "tax_assistant.read", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get("businessId") ?? undefined;
    const locationId = searchParams.get("locationId") ?? undefined;
    const { periodStart, periodEnd } = getRequestedPeriod({
      month: searchParams.get("month"),
      year: searchParams.get("year"),
    });
    const access = await requireBusinessAccess(user.id, "reports:write", businessId);
    const resolvedLocationId = locationId
      ? (await requireLocationAccess({
          userId: user.id,
          businessId: access.businessId,
          locationId,
          permission: "reports:write",
        })).locationId
      : undefined;
    const [planGate, featureAccessGate] = await Promise.all([
      requireMinimumPlan(user.id, access.businessId, "growth", "Upgrade to Growth to use Tax Assistant."),
      requireFeatureAccess(user.id, access.businessId, "tax_management"),
    ]);

    if (planGate) {
      return planGate;
    }

    if (featureAccessGate) {
      return featureAccessGate;
    }

    const summary = await calculateTaxAssistantForBusiness({
      businessId: access.businessId,
      locationId: resolvedLocationId,
      periodStart,
      periodEnd,
    });

    return Response.json({ summary });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("tax_assistant.read_failed", error);
    return jsonErrorFromUnknown(error, "Could not calculate tax assistant summary.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const featureGate = requirePhase3Feature("taxAssistant", "Tax assistant");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const body = await parseJsonBody(request, snapshotRequestSchema);
    const limited = await enforceRateLimit(request, "tax_assistant.write", 30, 60 * 60 * 1000);

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
    const [planGate, featureAccessGate] = await Promise.all([
      requireMinimumPlan(user.id, access.businessId, "growth", "Upgrade to Growth to save Tax Assistant snapshots."),
      requireFeatureAccess(user.id, access.businessId, "tax_management"),
    ]);

    if (planGate) {
      return planGate;
    }

    if (featureAccessGate) {
      return featureAccessGate;
    }

    const { periodStart, periodEnd } = getRequestedPeriod({
      month: body.month ? String(body.month) : null,
      year: body.year ? String(body.year) : null,
    });
    const summary = await calculateTaxAssistantForBusiness({
      businessId: access.businessId,
      locationId: resolvedLocationId,
      periodStart,
      periodEnd,
    });
    const snapshot = await saveTaxAssistantSnapshot({
      summary,
      recalculatedFromId: body.recalculatedFromId || undefined,
    });

    await getPrisma().auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: user.id,
        action: "tax_assistant.snapshot_saved",
        message: "Tax assistant snapshot saved.",
        metadata: {
          feature: "phase3h_tax_assistant",
          snapshotId: snapshot.id,
          ruleVersion: summary.ruleVersion,
          confidence: summary.confidence,
          periodStart: summary.periodStart,
          periodEnd: summary.periodEnd,
          locationId: resolvedLocationId,
        } as Prisma.InputJsonObject,
      },
    });

    return Response.json({ summary, snapshotId: snapshot.id, message: "Tax assistant snapshot saved." });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("tax_assistant.write_failed", error);
    return jsonErrorFromUnknown(error, "Could not save tax assistant snapshot.");
  }
}

function getRequestedPeriod({ month, year }: { month: string | null; year: string | null }) {
  const now = new Date();
  const parsedMonth = month ? Number.parseInt(month, 10) : now.getUTCMonth() + 1;
  const parsedYear = year ? Number.parseInt(year, 10) : now.getUTCFullYear();
  const safeMonth = Number.isFinite(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12
    ? parsedMonth
    : now.getUTCMonth() + 1;
  const safeYear = Number.isFinite(parsedYear) && parsedYear >= 2020 && parsedYear <= 2100
    ? parsedYear
    : now.getUTCFullYear();

  return {
    periodStart: new Date(Date.UTC(safeYear, safeMonth - 1, 1)),
    periodEnd: new Date(Date.UTC(safeYear, safeMonth, 1)),
  };
}
