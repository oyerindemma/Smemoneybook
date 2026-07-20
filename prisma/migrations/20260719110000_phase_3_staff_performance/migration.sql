-- Phase 3K staff performance foundation.
-- Additive only: stores transparent business-performance goals and snapshots.
CREATE TABLE "StaffPerformanceGoal" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT,
    "staffUserId" TEXT,
    "label" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "targetValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currentValue" DECIMAL(65,30),
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "achievedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffPerformanceGoal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StaffPerformanceSnapshot" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT,
    "staffUserId" TEXT,
    "formulaVersion" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metrics" JSONB NOT NULL,
    "goals" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "sourceMetrics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffPerformanceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StaffPerformanceGoal_businessId_status_periodStart_idx" ON "StaffPerformanceGoal"("businessId", "status", "periodStart");
CREATE INDEX "StaffPerformanceGoal_businessId_staffUserId_periodStart_idx" ON "StaffPerformanceGoal"("businessId", "staffUserId", "periodStart");
CREATE INDEX "StaffPerformanceGoal_businessId_locationId_periodStart_idx" ON "StaffPerformanceGoal"("businessId", "locationId", "periodStart");

CREATE INDEX "StaffPerformanceSnapshot_businessId_generatedAt_idx" ON "StaffPerformanceSnapshot"("businessId", "generatedAt");
CREATE INDEX "StaffPerformanceSnapshot_businessId_staffUserId_generatedAt_idx" ON "StaffPerformanceSnapshot"("businessId", "staffUserId", "generatedAt");
CREATE INDEX "StaffPerformanceSnapshot_businessId_locationId_generatedAt_idx" ON "StaffPerformanceSnapshot"("businessId", "locationId", "generatedAt");
CREATE INDEX "StaffPerformanceSnapshot_businessId_formulaVersion_generatedAt_idx" ON "StaffPerformanceSnapshot"("businessId", "formulaVersion", "generatedAt");

ALTER TABLE "StaffPerformanceGoal" ADD CONSTRAINT "StaffPerformanceGoal_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffPerformanceGoal" ADD CONSTRAINT "StaffPerformanceGoal_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffPerformanceSnapshot" ADD CONSTRAINT "StaffPerformanceSnapshot_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffPerformanceSnapshot" ADD CONSTRAINT "StaffPerformanceSnapshot_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffPerformanceGoal" ADD CONSTRAINT "StaffPerformanceGoal_target_check"
  CHECK ("targetValue" >= 0 AND ("currentValue" IS NULL OR "currentValue" >= 0) AND "periodEnd" > "periodStart");

ALTER TABLE "StaffPerformanceSnapshot" ADD CONSTRAINT "StaffPerformanceSnapshot_period_check"
  CHECK ("periodEnd" > "periodStart");
