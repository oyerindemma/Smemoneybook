-- Phase 3C: transparent business health score snapshots.
-- Additive only. Does not mutate existing financial records.

CREATE TABLE "BusinessHealthScoreSnapshot" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "locationId" TEXT,
  "formulaVersion" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "rating" TEXT NOT NULL,
  "confidence" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "components" JSONB NOT NULL,
  "recommendations" JSONB NOT NULL,
  "dataWarnings" JSONB NOT NULL,
  "sourceMetrics" JSONB NOT NULL,
  "recalculatedFromId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BusinessHealthScoreSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BusinessHealthScoreSnapshot_businessId_generatedAt_idx"
  ON "BusinessHealthScoreSnapshot"("businessId", "generatedAt");

CREATE INDEX "BusinessHealthScoreSnapshot_businessId_formulaVersion_generatedAt_idx"
  ON "BusinessHealthScoreSnapshot"("businessId", "formulaVersion", "generatedAt");

CREATE INDEX "BusinessHealthScoreSnapshot_businessId_locationId_generatedAt_idx"
  ON "BusinessHealthScoreSnapshot"("businessId", "locationId", "generatedAt");

ALTER TABLE "BusinessHealthScoreSnapshot"
  ADD CONSTRAINT "BusinessHealthScoreSnapshot_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusinessHealthScoreSnapshot"
  ADD CONSTRAINT "BusinessHealthScoreSnapshot_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
