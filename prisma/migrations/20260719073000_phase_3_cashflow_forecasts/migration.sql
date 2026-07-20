-- Phase 3D predictive cashflow snapshots.
-- Additive only: existing transactions, debts, accounts, and locations are untouched.
CREATE TABLE "CashflowForecastSnapshot" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT,
    "formulaVersion" TEXT NOT NULL,
    "horizonDays" INTEGER NOT NULL,
    "confidence" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "recordedThrough" TIMESTAMP(3) NOT NULL,
    "forecastStart" TIMESTAMP(3) NOT NULL,
    "forecastEnd" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openingCash" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "projectedInflows" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "projectedOutflows" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "projectedNetCash" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "forecastEndingCash" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lowerBound" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "upperBound" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "actualEndingCash" DECIMAL(65,30),
    "absoluteError" DECIMAL(65,30),
    "accuracyPercent" DECIMAL(65,30),
    "evaluatedAt" TIMESTAMP(3),
    "recordedMetrics" JSONB NOT NULL,
    "forecastSeries" JSONB NOT NULL,
    "assumptions" JSONB NOT NULL,
    "alerts" JSONB NOT NULL,
    "dataWarnings" JSONB NOT NULL,
    "sourceMetrics" JSONB NOT NULL,
    "backtestResults" JSONB NOT NULL,
    "recalculatedFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashflowForecastSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CashflowForecastSnapshot_businessId_generatedAt_idx" ON "CashflowForecastSnapshot"("businessId", "generatedAt");
CREATE INDEX "CashflowForecastSnapshot_businessId_horizonDays_generatedAt_idx" ON "CashflowForecastSnapshot"("businessId", "horizonDays", "generatedAt");
CREATE INDEX "CashflowForecastSnapshot_businessId_formulaVersion_generatedAt_idx" ON "CashflowForecastSnapshot"("businessId", "formulaVersion", "generatedAt");
CREATE INDEX "CashflowForecastSnapshot_businessId_locationId_generatedAt_idx" ON "CashflowForecastSnapshot"("businessId", "locationId", "generatedAt");
CREATE INDEX "CashflowForecastSnapshot_businessId_forecastEnd_idx" ON "CashflowForecastSnapshot"("businessId", "forecastEnd");

ALTER TABLE "CashflowForecastSnapshot" ADD CONSTRAINT "CashflowForecastSnapshot_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CashflowForecastSnapshot" ADD CONSTRAINT "CashflowForecastSnapshot_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
