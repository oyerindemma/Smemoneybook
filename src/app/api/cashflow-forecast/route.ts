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
  calculateCashflowForecastForBusiness,
  parseCashflowHorizon,
  saveCashflowForecastSnapshots,
} from "@/lib/phase3/cashflow-forecast-service";
import type { CashflowHorizonDays } from "@/lib/phase3/cashflow-forecast";

export const runtime = "nodejs";

const snapshotRequestSchema = z.object({
  businessId: z.preprocess((val) => val ?? "", z.string().min(1, "Choose a business.")),
  locationId: z.preprocess((val) => val ?? "", z.string().trim()).optional(),
  horizonDays: z.preprocess((val) => val ?? undefined, z.coerce.number().int()).optional(),
  recalculatedFromId: z.preprocess((val) => val ?? "", z.string().trim()).optional(),
});

export async function GET(request: Request) {
  try {
    const featureGate = requirePhase3Feature("cashflowForecasts", "Cashflow forecasts");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const limited = await enforceRateLimit(request, "cashflow_forecast.read", 120, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get("businessId") ?? undefined;
    const locationId = searchParams.get("locationId") ?? undefined;
    const horizonDays = parseRequestedHorizon(searchParams.get("horizonDays"));

    if (searchParams.has("horizonDays") && !horizonDays) {
      return jsonError("Choose a valid forecast horizon: 7, 30, or 90 days.", 400);
    }

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
      "Upgrade to Growth to use Cashflow Forecasts.",
    );

    if (planGate) {
      return planGate;
    }

    const forecast = await calculateCashflowForecastForBusiness({
      businessId: access.businessId,
      locationId: resolvedLocationId,
      horizons: horizonDays ? [horizonDays] : undefined,
    });

    return Response.json({ forecast });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("cashflow_forecast.read_failed", error);
    return jsonErrorFromUnknown(error, "Could not calculate cashflow forecast.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const featureGate = requirePhase3Feature("cashflowForecasts", "Cashflow forecasts");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const body = await parseJsonBody(request, snapshotRequestSchema);
    const horizonDays = parseRequestedHorizon(body.horizonDays);

    if (body.horizonDays !== undefined && !horizonDays) {
      return jsonError("Choose a valid forecast horizon: 7, 30, or 90 days.", 400);
    }

    const limited = await enforceRateLimit(request, "cashflow_forecast.write", 40, 60 * 60 * 1000);

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
      "Upgrade to Growth to save Cashflow Forecast snapshots.",
    );

    if (planGate) {
      return planGate;
    }

    const forecast = await calculateCashflowForecastForBusiness({
      businessId: access.businessId,
      locationId: resolvedLocationId,
      horizons: horizonDays ? [horizonDays] : undefined,
    });
    const snapshots = await saveCashflowForecastSnapshots({
      forecast,
      horizonDays,
      recalculatedFromId: body.recalculatedFromId || undefined,
    });

    await getPrisma().auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: user.id,
        action: "cashflow_forecast.snapshot_saved",
        message: "Cashflow forecast snapshot saved.",
        metadata: {
          feature: "phase3d_cashflow_forecast",
          snapshotIds: snapshots.map((snapshot) => snapshot.id),
          formulaVersion: forecast.formulaVersion,
          horizons: snapshots.map((snapshot) => snapshot.horizonDays),
          locationId: resolvedLocationId,
          confidence: forecast.forecasts.map((item) => ({
            horizonDays: item.horizonDays,
            confidence: item.confidence,
          })),
        } as Prisma.InputJsonObject,
      },
    });

    return Response.json({
      forecast,
      snapshotIds: snapshots.map((snapshot) => snapshot.id),
      message: "Cashflow forecast snapshot saved.",
    });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("cashflow_forecast.write_failed", error);
    return jsonErrorFromUnknown(error, "Could not save cashflow forecast.");
  }
}

function parseRequestedHorizon(value: unknown): CashflowHorizonDays | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  return parseCashflowHorizon(value);
}
