-- Phase 3G loan readiness assessment snapshots and consent logs.
-- Additive only: this is not a lending decision system and does not change financial records.
CREATE TABLE "LoanReadinessSnapshot" (
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
    "strengths" JSONB NOT NULL,
    "weaknesses" JSONB NOT NULL,
    "recommendations" JSONB NOT NULL,
    "dataCompleteness" JSONB NOT NULL,
    "dataWarnings" JSONB NOT NULL,
    "sourceMetrics" JSONB NOT NULL,
    "recalculatedFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanReadinessSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoanReadinessSharingLog" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "actorId" TEXT,
    "partnerName" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "consentText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONSENT_RECORDED',
    "sharedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "LoanReadinessSharingLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoanReadinessSnapshot_businessId_generatedAt_idx" ON "LoanReadinessSnapshot"("businessId", "generatedAt");
CREATE INDEX "LoanReadinessSnapshot_businessId_formulaVersion_generatedAt_idx" ON "LoanReadinessSnapshot"("businessId", "formulaVersion", "generatedAt");
CREATE INDEX "LoanReadinessSnapshot_businessId_locationId_generatedAt_idx" ON "LoanReadinessSnapshot"("businessId", "locationId", "generatedAt");

CREATE INDEX "LoanReadinessSharingLog_businessId_sharedAt_idx" ON "LoanReadinessSharingLog"("businessId", "sharedAt");
CREATE INDEX "LoanReadinessSharingLog_businessId_partnerName_sharedAt_idx" ON "LoanReadinessSharingLog"("businessId", "partnerName", "sharedAt");
CREATE INDEX "LoanReadinessSharingLog_snapshotId_idx" ON "LoanReadinessSharingLog"("snapshotId");

ALTER TABLE "LoanReadinessSnapshot" ADD CONSTRAINT "LoanReadinessSnapshot_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LoanReadinessSnapshot" ADD CONSTRAINT "LoanReadinessSnapshot_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LoanReadinessSharingLog" ADD CONSTRAINT "LoanReadinessSharingLog_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LoanReadinessSharingLog" ADD CONSTRAINT "LoanReadinessSharingLog_snapshotId_fkey"
  FOREIGN KEY ("snapshotId") REFERENCES "LoanReadinessSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
