-- Phase 3B bank reconciliation completion.
-- Additive only: no accounting transactions, balances, source imports, or existing matches are deleted or mutated destructively.

ALTER TABLE "BankStatementImport"
  ADD COLUMN "bankProfileId" TEXT,
  ADD COLUMN "accountLabel" TEXT,
  ADD COLUMN "bankName" TEXT,
  ADD COLUMN "fileSize" INTEGER,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'NGN',
  ADD COLUMN "openingBalance" DECIMAL(65,30),
  ADD COLUMN "closingBalance" DECIMAL(65,30);

ALTER TABLE "BankStatementImportRow"
  ADD COLUMN "valueDate" TIMESTAMP(3),
  ADD COLUMN "normalizedDescription" TEXT,
  ADD COLUMN "externalReference" TEXT,
  ADD COLUMN "debitAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "creditAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "signedAmount" DECIMAL(65,30),
  ADD COLUMN "duplicateStatus" TEXT NOT NULL DEFAULT 'UNIQUE',
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "BankReconciliationMatch"
  ADD COLUMN "confidenceReasons" JSONB,
  ADD COLUMN "suggestedBy" TEXT,
  ADD COLUMN "reviewedByUserId" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3);

CREATE TABLE "BankAccountProfile" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "bankName" TEXT,
  "maskedAccountNumber" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BankAccountProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BankReconciliationAction" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "statementEntryId" TEXT,
  "matchId" TEXT,
  "action" TEXT NOT NULL,
  "reason" TEXT,
  "performedByUserId" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BankReconciliationAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BankAccountProfile_businessId_label_key" ON "BankAccountProfile"("businessId", "label");
CREATE INDEX "BankAccountProfile_businessId_isActive_idx" ON "BankAccountProfile"("businessId", "isActive");

CREATE INDEX "BankStatementImport_businessId_bankProfileId_importedAt_idx"
  ON "BankStatementImport"("businessId", "bankProfileId", "importedAt");

CREATE INDEX "BankStatementImportRow_businessId_duplicateStatus_postedAt_idx"
  ON "BankStatementImportRow"("businessId", "duplicateStatus", "postedAt");

CREATE INDEX "BankReconciliationAction_businessId_createdAt_idx"
  ON "BankReconciliationAction"("businessId", "createdAt");
CREATE INDEX "BankReconciliationAction_businessId_action_createdAt_idx"
  ON "BankReconciliationAction"("businessId", "action", "createdAt");
CREATE INDEX "BankReconciliationAction_statementEntryId_idx"
  ON "BankReconciliationAction"("statementEntryId");
CREATE INDEX "BankReconciliationAction_matchId_idx"
  ON "BankReconciliationAction"("matchId");

ALTER TABLE "BankAccountProfile" ADD CONSTRAINT "BankAccountProfile_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BankStatementImport" ADD CONSTRAINT "BankStatementImport_bankProfileId_fkey"
  FOREIGN KEY ("bankProfileId") REFERENCES "BankAccountProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BankReconciliationAction" ADD CONSTRAINT "BankReconciliationAction_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BankReconciliationAction" ADD CONSTRAINT "BankReconciliationAction_statementEntryId_fkey"
  FOREIGN KEY ("statementEntryId") REFERENCES "BankStatementImportRow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BankReconciliationAction" ADD CONSTRAINT "BankReconciliationAction_matchId_fkey"
  FOREIGN KEY ("matchId") REFERENCES "BankReconciliationMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
