-- Phase 3G Loan Readiness completion. Additive profile, evidence, and audit metadata only.

ALTER TABLE "LoanReadinessSnapshot"
  ADD COLUMN "overallStatus" TEXT,
  ADD COLUMN "categoryResults" JSONB,
  ADD COLUMN "evidenceSummary" JSONB,
  ADD COLUMN "generatedByUserId" TEXT,
  ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE TABLE "LoanReadinessProfile" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "industry" TEXT,
  "operatingStartDate" TIMESTAMP(3),
  "fundingPurpose" TEXT,
  "requestedAmount" DECIMAL(65,30),
  "preferredCurrency" TEXT NOT NULL DEFAULT 'NGN',
  "consentToShare" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LoanReadinessProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoanReadinessDocument" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'MISSING',
  "reference" TEXT,
  "issuedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LoanReadinessDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoanReadinessProfile_businessId_key" ON "LoanReadinessProfile"("businessId");
CREATE INDEX "LoanReadinessProfile_businessId_updatedAt_idx" ON "LoanReadinessProfile"("businessId", "updatedAt");
CREATE UNIQUE INDEX "LoanReadinessDocument_businessId_documentType_key" ON "LoanReadinessDocument"("businessId", "documentType");
CREATE INDEX "LoanReadinessDocument_businessId_status_updatedAt_idx" ON "LoanReadinessDocument"("businessId", "status", "updatedAt");
CREATE INDEX "LoanReadinessSnapshot_generatedByUserId_generatedAt_idx" ON "LoanReadinessSnapshot"("generatedByUserId", "generatedAt");

ALTER TABLE "LoanReadinessProfile" ADD CONSTRAINT "LoanReadinessProfile_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LoanReadinessDocument" ADD CONSTRAINT "LoanReadinessDocument_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LoanReadinessSnapshot" ADD CONSTRAINT "LoanReadinessSnapshot_generatedByUserId_fkey"
  FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
