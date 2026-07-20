-- Phase 3N executive dashboard snapshots.
-- Additive only: stores derived owner summaries and recommended actions.
CREATE TABLE "ExecutiveDashboardSnapshot" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT,
    "formulaVersion" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" JSONB NOT NULL,
    "recommendedActions" JSONB NOT NULL,
    "sourceMetrics" JSONB NOT NULL,
    "freshness" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutiveDashboardSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExecutiveDashboardSnapshot_businessId_generatedAt_idx" ON "ExecutiveDashboardSnapshot"("businessId", "generatedAt");
CREATE INDEX "ExecutiveDashboardSnapshot_businessId_locationId_generatedAt_idx" ON "ExecutiveDashboardSnapshot"("businessId", "locationId", "generatedAt");
CREATE INDEX "ExecutiveDashboardSnapshot_businessId_formulaVersion_generatedAt_idx" ON "ExecutiveDashboardSnapshot"("businessId", "formulaVersion", "generatedAt");

ALTER TABLE "ExecutiveDashboardSnapshot" ADD CONSTRAINT "ExecutiveDashboardSnapshot_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExecutiveDashboardSnapshot" ADD CONSTRAINT "ExecutiveDashboardSnapshot_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExecutiveDashboardSnapshot" ADD CONSTRAINT "ExecutiveDashboardSnapshot_period_check"
  CHECK ("periodEnd" > "periodStart");
