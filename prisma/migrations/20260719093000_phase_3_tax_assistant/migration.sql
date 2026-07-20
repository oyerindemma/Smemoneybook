-- Phase 3H tax assistant snapshots.
-- Additive only: this stores recordkeeping estimates and does not file taxes.
CREATE TABLE "TaxAssistantSnapshot" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT,
    "country" TEXT NOT NULL DEFAULT 'NG',
    "ruleVersion" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taxableSales" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "estimatedTax" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "configuredRates" JSONB NOT NULL,
    "missingSettings" JSONB NOT NULL,
    "inconsistencies" JSONB NOT NULL,
    "reminders" JSONB NOT NULL,
    "exportSummary" JSONB NOT NULL,
    "dataWarnings" JSONB NOT NULL,
    "sourceMetrics" JSONB NOT NULL,
    "recalculatedFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxAssistantSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaxAssistantSnapshot_businessId_generatedAt_idx" ON "TaxAssistantSnapshot"("businessId", "generatedAt");
CREATE INDEX "TaxAssistantSnapshot_businessId_ruleVersion_generatedAt_idx" ON "TaxAssistantSnapshot"("businessId", "ruleVersion", "generatedAt");
CREATE INDEX "TaxAssistantSnapshot_businessId_locationId_generatedAt_idx" ON "TaxAssistantSnapshot"("businessId", "locationId", "generatedAt");

ALTER TABLE "TaxAssistantSnapshot" ADD CONSTRAINT "TaxAssistantSnapshot_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaxAssistantSnapshot" ADD CONSTRAINT "TaxAssistantSnapshot_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
