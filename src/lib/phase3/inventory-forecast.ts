export const inventoryForecastFormulaVersion = "inventory-forecast-v1";

export type InventoryForecastConfidence = "high" | "medium" | "low" | "insufficient_data";
export type InventoryForecastClassification =
  | "out_of_stock"
  | "likely_stockout"
  | "fast_moving"
  | "steady"
  | "slow_moving"
  | "dead_stock"
  | "excess_inventory";

export type InventoryForecastInput = {
  businessId: string;
  locationId?: string;
  businessCreatedAt: Date;
  periodStart: Date;
  recordedThrough: Date;
  generatedAt?: Date;
  forecastHorizonDays?: number;
  defaultSupplierLeadTimeDays?: number;
  defaultSafetyStockDays?: number;
  itemId?: string;
  overrides?: InventoryForecastOverride[];
  items: InventoryForecastItemInput[];
  movements: InventoryForecastMovement[];
};

export type InventoryForecastOverride = {
  itemId?: string;
  supplierLeadTimeDays?: number;
  safetyStockDays?: number;
  safetyStockQuantity?: number;
  minimumReorderQuantity?: number;
};

export type InventoryForecastItemInput = {
  id: string;
  name: string;
  currentQuantity: number;
  lowStockLevel: number;
  costPrice?: number;
  sellingPrice?: number;
};

export type InventoryForecastMovement = {
  itemId: string;
  type: string;
  quantity: number;
  adjustmentType?: string | null;
  createdAt: Date;
  locationId?: string | null;
  sourceLocationId?: string | null;
  destinationLocationId?: string | null;
};

export type InventoryForecastRecommendation = {
  action: "restock_now" | "restock_soon" | "monitor" | "reduce_purchase" | "review_dead_stock" | "no_action";
  message: string;
  suggestedQuantity: number;
};

export type InventoryForecastAccuracy = {
  available: boolean;
  predictedDemandQuantity?: number;
  actualDemandQuantity?: number;
  absoluteErrorQuantity?: number;
  accuracyPercent?: number;
  reason?: string;
};

export type InventoryItemForecast = {
  itemId: string;
  itemName: string;
  classification: InventoryForecastClassification;
  confidence: InventoryForecastConfidence;
  currentQuantity: number;
  lowStockLevel: number;
  averageDailyDemand: number;
  recentDailyDemand: number;
  forecastDailyDemand: number;
  trendMultiplier: number;
  seasonalMultiplier: number;
  daysOfStockRemaining: number | null;
  predictedStockoutAt: string | null;
  restockByDate: string | null;
  suggestedReorderQuantity: number;
  supplierLeadTimeDays: number;
  safetyStockDays: number;
  safetyStockQuantity: number;
  manualOverride?: InventoryForecastOverride;
  assumptions: string[];
  recommendation: InventoryForecastRecommendation;
  dataWarnings: string[];
  sourceMetrics: Record<string, number | string | boolean | null>;
  accuracyMetrics: InventoryForecastAccuracy;
};

export type InventoryForecastSummary = {
  businessId: string;
  locationId?: string;
  formulaVersion: typeof inventoryForecastFormulaVersion;
  generatedAt: string;
  periodStart: string;
  recordedThrough: string;
  forecastHorizonDays: number;
  forecasts: InventoryItemForecast[];
  dataWarnings: string[];
  sourceMetrics: Record<string, number | string | boolean | null>;
};

type DemandDraft = Omit<InventoryItemForecast, "classification" | "recommendation"> & {
  demandMovementCount: number;
};

const dayMs = 86_400_000;
const minHistoryDays = 14;
const minDemandMovements = 5;

export function calculateInventoryForecast(input: InventoryForecastInput): InventoryForecastSummary {
  const generatedAt = input.generatedAt ?? new Date();
  const forecastHorizonDays = cleanPositiveInteger(input.forecastHorizonDays, 30);
  const historyDays = Math.max(
    0,
    Math.min(
      daysBetween(input.businessCreatedAt, input.recordedThrough),
      daysBetween(input.periodStart, input.recordedThrough),
    ),
  );
  const scopedItems = input.itemId ? input.items.filter((item) => item.id === input.itemId) : input.items;
  const scopedMovements = input.movements.filter((movement) =>
    isInRange(movement.createdAt, input.periodStart, input.recordedThrough),
  );
  const demandDrafts = scopedItems.map((item) =>
    buildDemandDraft({
      input,
      item,
      movements: scopedMovements.filter((movement) => movement.itemId === item.id),
      generatedAt,
      forecastHorizonDays,
      historyDays,
    }),
  );
  const positiveDemandRates = demandDrafts
    .map((draft) => draft.forecastDailyDemand)
    .filter((rate) => rate > 0)
    .sort((left, right) => left - right);
  const fastThreshold = percentile(positiveDemandRates, 0.75);
  const slowThreshold = percentile(positiveDemandRates, 0.25);
  const forecasts = demandDrafts
    .map((draft) => {
      const classification = classifyForecast({
        draft,
        fastThreshold,
        slowThreshold,
        historyDays,
      });

      return {
        ...draft,
        classification,
        recommendation: buildRecommendation(draft, classification),
      };
    })
    .sort(compareForecastPriority);
  const sourceMetrics = {
    itemCount: scopedItems.length,
    movementCount: scopedMovements.length,
    historyDays,
    forecastHorizonDays,
    locationScoped: Boolean(input.locationId),
    fastThreshold: roundQuantity(fastThreshold),
    slowThreshold: roundQuantity(slowThreshold),
  };
  const dataWarnings = buildSummaryWarnings({
    itemCount: scopedItems.length,
    movementCount: scopedMovements.length,
    historyDays,
    locationScoped: Boolean(input.locationId),
  });

  return {
    businessId: input.businessId,
    locationId: input.locationId,
    formulaVersion: inventoryForecastFormulaVersion,
    generatedAt: generatedAt.toISOString(),
    periodStart: input.periodStart.toISOString(),
    recordedThrough: input.recordedThrough.toISOString(),
    forecastHorizonDays,
    forecasts,
    dataWarnings,
    sourceMetrics,
  };
}

function buildDemandDraft({
  input,
  item,
  movements,
  generatedAt,
  forecastHorizonDays,
  historyDays,
}: {
  input: InventoryForecastInput;
  item: InventoryForecastItemInput;
  movements: InventoryForecastMovement[];
  generatedAt: Date;
  forecastHorizonDays: number;
  historyDays: number;
}): DemandDraft {
  const demandMovements = movements.filter(isDemandMovement);
  const recentDays = Math.max(1, Math.min(30, historyDays));
  const recentStart = addDays(input.recordedThrough, -recentDays);
  const recentDemandMovements = demandMovements.filter((movement) => movement.createdAt >= recentStart);
  const totalDemand = sumMovementQuantity(demandMovements);
  const recentDemand = sumMovementQuantity(recentDemandMovements);
  const averageDailyDemand = historyDays > 0 ? totalDemand / historyDays : 0;
  const recentDailyDemand = recentDemand / recentDays;
  const seasonalMultiplier = calculateSeasonalMultiplier({
    demandMovements,
    recordedThrough: input.recordedThrough,
    forecastHorizonDays,
    averageDailyDemand,
  });
  const trendWeightedDemand = recentDemandMovements.length >= 2
    ? recentDailyDemand * 0.6 + averageDailyDemand * 0.4
    : averageDailyDemand;
  const forecastDailyDemand = roundQuantity(trendWeightedDemand * seasonalMultiplier);
  const override = findOverride(input.overrides, item.id);
  const supplierLeadTimeDays = cleanPositiveInteger(
    override?.supplierLeadTimeDays,
    cleanPositiveInteger(input.defaultSupplierLeadTimeDays, 14),
  );
  const safetyStockDays = cleanPositiveInteger(
    override?.safetyStockDays,
    cleanPositiveInteger(input.defaultSafetyStockDays, 7),
  );
  const safetyStockQuantity = roundQuantity(
    override?.safetyStockQuantity !== undefined
      ? cleanQuantity(override.safetyStockQuantity)
      : Math.max(item.lowStockLevel, forecastDailyDemand * safetyStockDays),
  );
  const currentQuantity = roundQuantity(cleanQuantity(item.currentQuantity));
  const lowStockLevel = roundQuantity(cleanQuantity(item.lowStockLevel));
  const daysOfStockRemaining = forecastDailyDemand > 0
    ? roundQuantity(currentQuantity / forecastDailyDemand)
    : null;
  const predictedStockoutAt = daysOfStockRemaining === null
    ? null
    : addDays(input.recordedThrough, Math.max(0, daysOfStockRemaining));
  const restockByDate = predictedStockoutAt
    ? addDays(predictedStockoutAt, -supplierLeadTimeDays)
    : currentQuantity <= safetyStockQuantity
      ? generatedAt
      : null;
  const demandThroughLeadTimeAndHorizon = forecastDailyDemand * (supplierLeadTimeDays + forecastHorizonDays);
  const reorderNeed = demandThroughLeadTimeAndHorizon + safetyStockQuantity - currentQuantity;
  const suggestedReorderQuantity = roundQuantity(
    reorderNeed > 0 ? Math.max(reorderNeed, override?.minimumReorderQuantity ?? 0) : 0,
  );
  const confidence = determineConfidence({
    historyDays,
    demandMovementCount: demandMovements.length,
    latestDemandDaysAgo: latestDemandDaysAgo(demandMovements, input.recordedThrough),
  });
  const trendMultiplier = averageDailyDemand > 0
    ? roundQuantity(forecastDailyDemand / averageDailyDemand)
    : 1;
  const dataWarnings = buildItemWarnings({
    item,
    historyDays,
    confidence,
    seasonalMultiplier,
    override,
  });

  return {
    itemId: item.id,
    itemName: item.name,
    confidence,
    currentQuantity,
    lowStockLevel,
    averageDailyDemand: roundQuantity(averageDailyDemand),
    recentDailyDemand: roundQuantity(recentDailyDemand),
    forecastDailyDemand,
    trendMultiplier,
    seasonalMultiplier,
    daysOfStockRemaining,
    predictedStockoutAt: predictedStockoutAt?.toISOString() ?? null,
    restockByDate: restockByDate?.toISOString() ?? null,
    suggestedReorderQuantity,
    supplierLeadTimeDays,
    safetyStockDays,
    safetyStockQuantity,
    manualOverride: override,
    assumptions: buildAssumptions({
      forecastHorizonDays,
      supplierLeadTimeDays,
      safetyStockDays,
      seasonalMultiplier,
      hasOverride: Boolean(override),
    }),
    dataWarnings,
    sourceMetrics: {
      historyDays,
      demandMovementCount: demandMovements.length,
      recentDemandMovementCount: recentDemandMovements.length,
      totalDemand: roundQuantity(totalDemand),
      recentDemand: roundQuantity(recentDemand),
      stockInQuantity: roundQuantity(sumMovementQuantity(movements.filter(isStockInMovement))),
      nonDemandStockOutQuantity: roundQuantity(
        sumMovementQuantity(movements.filter((movement) => normalize(movement.type) === "stock_out" && !isDemandMovement(movement))),
      ),
      latestDemandDaysAgo: latestDemandDaysAgo(demandMovements, input.recordedThrough),
      forecastHorizonDays,
      supplierLeadTimeDays,
      safetyStockDays,
      itemCostPrice: item.costPrice ?? null,
      itemSellingPrice: item.sellingPrice ?? null,
    },
    accuracyMetrics: backtestItemDemand({
      input,
      itemId: item.id,
      forecastHorizonDays,
    }),
    demandMovementCount: demandMovements.length,
  };
}

function classifyForecast({
  draft,
  fastThreshold,
  slowThreshold,
  historyDays,
}: {
  draft: DemandDraft;
  fastThreshold: number;
  slowThreshold: number;
  historyDays: number;
}): InventoryForecastClassification {
  if (draft.currentQuantity <= 0) {
    return "out_of_stock";
  }

  if (
    draft.daysOfStockRemaining !== null &&
    draft.daysOfStockRemaining <= draft.supplierLeadTimeDays + draft.safetyStockDays
  ) {
    return "likely_stockout";
  }

  if (historyDays >= 60 && draft.demandMovementCount === 0 && draft.currentQuantity > 0) {
    return "dead_stock";
  }

  if (
    draft.daysOfStockRemaining !== null &&
    draft.daysOfStockRemaining >= 120 &&
    draft.currentQuantity >= Math.max(draft.lowStockLevel * 3, 1)
  ) {
    return "excess_inventory";
  }

  if (draft.forecastDailyDemand > 0 && fastThreshold > 0 && draft.forecastDailyDemand >= fastThreshold) {
    return "fast_moving";
  }

  if (
    draft.forecastDailyDemand > 0 &&
    slowThreshold > 0 &&
    draft.forecastDailyDemand <= slowThreshold &&
    draft.currentQuantity > draft.lowStockLevel
  ) {
    return "slow_moving";
  }

  return "steady";
}

function buildRecommendation(
  draft: DemandDraft,
  classification: InventoryForecastClassification,
): InventoryForecastRecommendation {
  if (classification === "out_of_stock") {
    return {
      action: "restock_now",
      message: `${draft.itemName} is out of stock based on the current quantity.`,
      suggestedQuantity: draft.suggestedReorderQuantity,
    };
  }

  if (classification === "likely_stockout") {
    return {
      action: draft.currentQuantity <= draft.safetyStockQuantity ? "restock_now" : "restock_soon",
      message: `${draft.itemName} may run low before the supplier lead time is covered.`,
      suggestedQuantity: draft.suggestedReorderQuantity,
    };
  }

  if (classification === "dead_stock") {
    return {
      action: "review_dead_stock",
      message: `${draft.itemName} has stock but no recent demand in the forecast window.`,
      suggestedQuantity: 0,
    };
  }

  if (classification === "excess_inventory" || classification === "slow_moving") {
    return {
      action: "reduce_purchase",
      message: `${draft.itemName} has enough cover based on recorded demand.`,
      suggestedQuantity: 0,
    };
  }

  if (classification === "fast_moving") {
    return {
      action: "monitor",
      message: `${draft.itemName} is moving faster than most tracked products.`,
      suggestedQuantity: draft.suggestedReorderQuantity,
    };
  }

  return {
    action: "no_action",
    message: `${draft.itemName} stock looks steady from the recorded data.`,
    suggestedQuantity: draft.suggestedReorderQuantity,
  };
}

function determineConfidence({
  historyDays,
  demandMovementCount,
  latestDemandDaysAgo,
}: {
  historyDays: number;
  demandMovementCount: number;
  latestDemandDaysAgo: number | null;
}): InventoryForecastConfidence {
  if (historyDays < minHistoryDays || demandMovementCount < minDemandMovements) {
    return "insufficient_data";
  }

  let score = 0;
  score += Math.min(2, historyDays / 30);
  score += Math.min(2, demandMovementCount / 10);

  if (latestDemandDaysAgo === null || latestDemandDaysAgo > 30) {
    score -= 1;
  } else if (latestDemandDaysAgo <= 7) {
    score += 0.5;
  }

  if (score >= 4) {
    return "high";
  }

  if (score >= 2.75) {
    return "medium";
  }

  return "low";
}

function buildSummaryWarnings({
  itemCount,
  movementCount,
  historyDays,
  locationScoped,
}: {
  itemCount: number;
  movementCount: number;
  historyDays: number;
  locationScoped: boolean;
}) {
  const warnings: string[] = [];

  if (itemCount === 0) {
    warnings.push("No active inventory products are available for forecasting.");
  }

  if (movementCount === 0) {
    warnings.push("No inventory movements are available in the forecast history window.");
  }

  if (historyDays < minHistoryDays) {
    warnings.push(`At least ${minHistoryDays} days of inventory history is needed for product-level forecasts.`);
  }

  if (locationScoped) {
    warnings.push("Location forecasts use location-specific balances and movements when available.");
  }

  return warnings;
}

function buildItemWarnings({
  item,
  historyDays,
  confidence,
  seasonalMultiplier,
  override,
}: {
  item: InventoryForecastItemInput;
  historyDays: number;
  confidence: InventoryForecastConfidence;
  seasonalMultiplier: number;
  override?: InventoryForecastOverride;
}) {
  const warnings: string[] = [];

  if (confidence === "insufficient_data") {
    warnings.push(
      `${item.name} needs at least ${minHistoryDays} days of history and ${minDemandMovements} stock-out demand movements for a stronger forecast.`,
    );
  }

  if (historyDays < 365 && seasonalMultiplier === 1) {
    warnings.push("No seasonal adjustment is applied until at least one year of movement history exists.");
  }

  if (override) {
    warnings.push("Manual lead-time or safety-stock overrides were used for this recommendation.");
  }

  warnings.push("Inventory forecasts are planning estimates and never create purchase orders automatically.");

  return [...new Set(warnings)];
}

function buildAssumptions({
  forecastHorizonDays,
  supplierLeadTimeDays,
  safetyStockDays,
  seasonalMultiplier,
  hasOverride,
}: {
  forecastHorizonDays: number;
  supplierLeadTimeDays: number;
  safetyStockDays: number;
  seasonalMultiplier: number;
  hasOverride: boolean;
}) {
  const assumptions = [
    `Demand is projected over ${forecastHorizonDays} days from recorded stock-out movements.`,
    `Supplier lead time is ${supplierLeadTimeDays} days.`,
    `Safety stock covers ${safetyStockDays} days of forecast demand unless a quantity override is supplied.`,
    "Recent 30-day demand is weighted more heavily than older demand.",
  ];

  if (seasonalMultiplier !== 1) {
    assumptions.push(`Seasonality multiplier ${seasonalMultiplier} was applied from prior-year demand.`);
  } else {
    assumptions.push("No seasonal adjustment was applied.");
  }

  if (hasOverride) {
    assumptions.push("Manual override inputs take precedence over defaults.");
  }

  return assumptions;
}

function calculateSeasonalMultiplier({
  demandMovements,
  recordedThrough,
  forecastHorizonDays,
  averageDailyDemand,
}: {
  demandMovements: InventoryForecastMovement[];
  recordedThrough: Date;
  forecastHorizonDays: number;
  averageDailyDemand: number;
}) {
  if (averageDailyDemand <= 0) {
    return 1;
  }

  const seasonalStart = addDays(recordedThrough, -365);
  const seasonalEnd = addDays(seasonalStart, forecastHorizonDays);
  const seasonalMovements = demandMovements.filter((movement) =>
    isInRange(movement.createdAt, seasonalStart, seasonalEnd),
  );

  if (seasonalMovements.length < 3) {
    return 1;
  }

  const seasonalDailyDemand = sumMovementQuantity(seasonalMovements) / Math.max(1, forecastHorizonDays);
  return roundQuantity(clamp(seasonalDailyDemand / averageDailyDemand, 0.7, 1.3));
}

function backtestItemDemand({
  input,
  itemId,
  forecastHorizonDays,
}: {
  input: InventoryForecastInput;
  itemId: string;
  forecastHorizonDays: number;
}): InventoryForecastAccuracy {
  const actualEnd = input.recordedThrough;
  const actualStart = addDays(actualEnd, -forecastHorizonDays);
  const trainingStart = addDays(actualStart, -Math.max(30, forecastHorizonDays * 2));
  const itemDemand = input.movements.filter((movement) => movement.itemId === itemId && isDemandMovement(movement));
  const trainingMovements = itemDemand.filter((movement) => isInRange(movement.createdAt, trainingStart, actualStart));
  const actualMovements = itemDemand.filter((movement) => isInRange(movement.createdAt, actualStart, actualEnd));

  if (trainingMovements.length < 3 || actualMovements.length === 0) {
    return {
      available: false,
      reason: "Not enough completed demand history exists for this product backtest.",
    };
  }

  const trainingDays = Math.max(1, daysBetween(trainingStart, actualStart));
  const predictedDemandQuantity = roundQuantity((sumMovementQuantity(trainingMovements) / trainingDays) * forecastHorizonDays);
  const actualDemandQuantity = roundQuantity(sumMovementQuantity(actualMovements));
  const absoluteErrorQuantity = roundQuantity(Math.abs(predictedDemandQuantity - actualDemandQuantity));
  const denominator = Math.max(actualDemandQuantity, predictedDemandQuantity, 1);
  const accuracyPercent = Math.max(0, roundPercent(1 - absoluteErrorQuantity / denominator));

  return {
    available: true,
    predictedDemandQuantity,
    actualDemandQuantity,
    absoluteErrorQuantity,
    accuracyPercent,
  };
}

function findOverride(overrides: InventoryForecastOverride[] | undefined, itemId: string) {
  return overrides?.find((override) => !override.itemId || override.itemId === itemId);
}

function isDemandMovement(movement: InventoryForecastMovement) {
  return normalize(movement.type) === "stock_out" && ["", "stock_out"].includes(normalize(movement.adjustmentType));
}

function isStockInMovement(movement: InventoryForecastMovement) {
  return normalize(movement.type) === "stock_in";
}

function sumMovementQuantity(movements: InventoryForecastMovement[]) {
  return movements.reduce((sum, movement) => sum + cleanQuantity(movement.quantity), 0);
}

function latestDemandDaysAgo(movements: InventoryForecastMovement[], recordedThrough: Date) {
  const latest = movements.reduce<Date | undefined>((current, movement) => {
    if (!current || movement.createdAt > current) {
      return movement.createdAt;
    }

    return current;
  }, undefined);

  return latest ? daysBetween(latest, recordedThrough) : null;
}

function compareForecastPriority(left: InventoryItemForecast, right: InventoryItemForecast) {
  const priority: Record<InventoryForecastClassification, number> = {
    out_of_stock: 0,
    likely_stockout: 1,
    fast_moving: 2,
    excess_inventory: 3,
    dead_stock: 4,
    slow_moving: 5,
    steady: 6,
  };

  return priority[left.classification] - priority[right.classification] ||
    right.suggestedReorderQuantity - left.suggestedReorderQuantity ||
    left.itemName.localeCompare(right.itemName);
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) {
    return 0;
  }

  const index = Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * percentileValue)));
  return values[index];
}

function isInRange(date: Date, start: Date, end: Date) {
  return date >= start && date < end;
}

function daysBetween(start: Date, end: Date) {
  return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / dayMs));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * dayMs);
}

function normalize(value?: string | null) {
  return (value ?? "").toLowerCase();
}

function cleanPositiveInteger(value: number | undefined, defaultValue: number) {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return defaultValue;
  }

  return Math.trunc(value);
}

function cleanQuantity(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function roundQuantity(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function roundPercent(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 10000) / 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
