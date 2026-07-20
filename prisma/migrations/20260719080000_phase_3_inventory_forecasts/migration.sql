-- Phase 3E smart inventory forecast snapshots.
-- Additive only: existing inventory balances, movements, products, and transfers are untouched.
CREATE TABLE "InventoryForecastSnapshot" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT,
    "itemId" TEXT NOT NULL,
    "formulaVersion" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "recordedThrough" TIMESTAMP(3) NOT NULL,
    "forecastHorizonDays" INTEGER NOT NULL DEFAULT 30,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lowStockLevel" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "averageDailyDemand" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "recentDailyDemand" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "trendMultiplier" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "daysOfStockRemaining" DECIMAL(65,30),
    "predictedStockoutAt" TIMESTAMP(3),
    "restockByDate" TIMESTAMP(3),
    "suggestedReorderQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "supplierLeadTimeDays" INTEGER NOT NULL DEFAULT 14,
    "safetyStockQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "manualOverride" JSONB,
    "assumptions" JSONB NOT NULL,
    "recommendation" JSONB NOT NULL,
    "dataWarnings" JSONB NOT NULL,
    "sourceMetrics" JSONB NOT NULL,
    "accuracyMetrics" JSONB,
    "actualDemandQuantity" DECIMAL(65,30),
    "forecastErrorQuantity" DECIMAL(65,30),
    "evaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryForecastSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InventoryForecastSnapshot_businessId_generatedAt_idx" ON "InventoryForecastSnapshot"("businessId", "generatedAt");
CREATE INDEX "InventoryForecastSnapshot_businessId_itemId_generatedAt_idx" ON "InventoryForecastSnapshot"("businessId", "itemId", "generatedAt");
CREATE INDEX "InventoryForecastSnapshot_businessId_locationId_generatedAt_idx" ON "InventoryForecastSnapshot"("businessId", "locationId", "generatedAt");
CREATE INDEX "InventoryForecastSnapshot_businessId_classification_generatedAt_idx" ON "InventoryForecastSnapshot"("businessId", "classification", "generatedAt");
CREATE INDEX "InventoryForecastSnapshot_businessId_predictedStockoutAt_idx" ON "InventoryForecastSnapshot"("businessId", "predictedStockoutAt");

ALTER TABLE "InventoryForecastSnapshot" ADD CONSTRAINT "InventoryForecastSnapshot_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryForecastSnapshot" ADD CONSTRAINT "InventoryForecastSnapshot_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryForecastSnapshot" ADD CONSTRAINT "InventoryForecastSnapshot_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
