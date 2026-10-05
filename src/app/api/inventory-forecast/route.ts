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
  calculateInventoryForecastForBusiness,
  saveInventoryForecastSnapshots,
} from "@/lib/phase3/inventory-forecast-service";
import type { InventoryForecastOverride } from "@/lib/phase3/inventory-forecast";

export const runtime = "nodejs";

const forecastRequestSchema = z.object({
  businessId: z.preprocess((val) => val ?? "", z.string().min(1, "Choose a business.")),
  locationId: z.preprocess((val) => val ?? "", z.string().trim()).optional(),
  itemId: z.preprocess((val) => val ?? "", z.string().trim()).optional(),
  forecastHorizonDays: z.preprocess((val) => val ?? undefined, z.coerce.number().int().positive()).optional(),
  supplierLeadTimeDays: z.preprocess((val) => val ?? undefined, z.coerce.number().int().positive()).optional(),
  safetyStockDays: z.preprocess((val) => val ?? undefined, z.coerce.number().int().positive()).optional(),
  safetyStockQuantity: z.preprocess((val) => val ?? undefined, z.coerce.number().finite().nonnegative()).optional(),
  minimumReorderQuantity: z.preprocess((val) => val ?? undefined, z.coerce.number().finite().nonnegative()).optional(),
});

export async function GET(request: Request) {
  try {
    const featureGate = requirePhase3Feature("inventoryForecasting", "Inventory forecasting");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const limited = await enforceRateLimit(request, "inventory_forecast.read", 120, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get("businessId") ?? undefined;
    const locationId = searchParams.get("locationId") ?? undefined;
    const itemId = searchParams.get("itemId") ?? undefined;
    const access = await requireBusinessAccess(user.id, "inventory:write", businessId);
    const resolvedLocationId = locationId
      ? (await requireLocationAccess({
          userId: user.id,
          businessId: access.businessId,
          locationId,
          permission: "inventory:write",
        })).locationId
      : undefined;
    const planGate = await requireMinimumPlan(
      user.id,
      access.businessId,
      "growth",
      "Upgrade to Growth to use Inventory Forecasting.",
    );

    if (planGate) {
      return planGate;
    }

    const forecast = await calculateInventoryForecastForBusiness({
      businessId: access.businessId,
      locationId: resolvedLocationId,
      itemId,
      forecastHorizonDays: readPositiveInteger(searchParams.get("forecastHorizonDays")),
      defaultSupplierLeadTimeDays: readPositiveInteger(searchParams.get("supplierLeadTimeDays")),
      defaultSafetyStockDays: readPositiveInteger(searchParams.get("safetyStockDays")),
      overrides: buildOverrides({
        itemId,
        supplierLeadTimeDays: readPositiveInteger(searchParams.get("supplierLeadTimeDays")),
        safetyStockDays: readPositiveInteger(searchParams.get("safetyStockDays")),
        safetyStockQuantity: readPositiveNumber(searchParams.get("safetyStockQuantity")),
        minimumReorderQuantity: readPositiveNumber(searchParams.get("minimumReorderQuantity")),
      }),
    });

    return Response.json({ forecast });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("inventory_forecast.read_failed", error);
    return jsonErrorFromUnknown(error, "Could not calculate inventory forecast.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const featureGate = requirePhase3Feature("inventoryForecasting", "Inventory forecasting");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const body = await parseJsonBody(request, forecastRequestSchema);
    const limited = await enforceRateLimit(request, "inventory_forecast.write", 40, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireBusinessAccess(user.id, "inventory:write", body.businessId);
    const resolvedLocationId = body.locationId
      ? (await requireLocationAccess({
          userId: user.id,
          businessId: access.businessId,
          locationId: body.locationId,
          permission: "inventory:write",
        })).locationId
      : undefined;
    const planGate = await requireMinimumPlan(
      user.id,
      access.businessId,
      "growth",
      "Upgrade to Growth to save Inventory Forecast snapshots.",
    );

    if (planGate) {
      return planGate;
    }

    const forecast = await calculateInventoryForecastForBusiness({
      businessId: access.businessId,
      locationId: resolvedLocationId,
      itemId: body.itemId || undefined,
      forecastHorizonDays: body.forecastHorizonDays,
      defaultSupplierLeadTimeDays: body.supplierLeadTimeDays,
      defaultSafetyStockDays: body.safetyStockDays,
      overrides: buildOverrides({
        itemId: body.itemId || undefined,
        supplierLeadTimeDays: body.supplierLeadTimeDays,
        safetyStockDays: body.safetyStockDays,
        safetyStockQuantity: body.safetyStockQuantity,
        minimumReorderQuantity: body.minimumReorderQuantity,
      }),
    });
    const snapshots = await saveInventoryForecastSnapshots({
      forecast,
      itemId: body.itemId || undefined,
    });

    await getPrisma().auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: user.id,
        action: "inventory_forecast.snapshot_saved",
        message: "Inventory forecast snapshot saved.",
        metadata: {
          feature: "phase3e_inventory_forecast",
          snapshotIds: snapshots.map((snapshot) => snapshot.id),
          formulaVersion: forecast.formulaVersion,
          forecastHorizonDays: forecast.forecastHorizonDays,
          locationId: resolvedLocationId,
          itemIds: snapshots.map((snapshot) => snapshot.itemId),
          classifications: snapshots.map((snapshot) => snapshot.classification),
        } as Prisma.InputJsonObject,
      },
    });

    return Response.json({
      forecast,
      snapshotIds: snapshots.map((snapshot) => snapshot.id),
      message: "Inventory forecast snapshot saved.",
    });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("inventory_forecast.write_failed", error);
    return jsonErrorFromUnknown(error, "Could not save inventory forecast.");
  }
}

function buildOverrides(override: InventoryForecastOverride) {
  const hasOverride = override.supplierLeadTimeDays !== undefined ||
    override.safetyStockDays !== undefined ||
    override.safetyStockQuantity !== undefined ||
    override.minimumReorderQuantity !== undefined;

  return hasOverride ? [override] : undefined;
}

function readPositiveInteger(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function readPositiveNumber(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
