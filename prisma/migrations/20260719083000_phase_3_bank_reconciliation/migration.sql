-- Phase 3F bank statement reconciliation foundation.
-- Additive only: existing transactions, accounts, balances, and stock records are untouched.
CREATE TABLE "BankStatementImport" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "accountId" TEXT,
    "locationId" TEXT,
    "uploadedById" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'csv',
    "fileName" TEXT,
    "fileHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IMPORTED',
    "statementStart" TIMESTAMP(3),
    "statementEnd" TIMESTAMP(3),
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateRowCount" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "reopenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankStatementImport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BankStatementImportRow" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "direction" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "balance" DECIMAL(65,30),
    "fingerprint" TEXT NOT NULL,
    "duplicateOfRowId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "suggestedCategory" TEXT,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatementImportRow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BankReconciliationMatch" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "transactionId" TEXT,
    "accountId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "matchType" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "signals" JSONB NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "confirmedById" TEXT,
    "rejectedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankReconciliationMatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BankStatementImport_businessId_fileHash_key" ON "BankStatementImport"("businessId", "fileHash");
CREATE INDEX "BankStatementImport_businessId_importedAt_idx" ON "BankStatementImport"("businessId", "importedAt");
CREATE INDEX "BankStatementImport_businessId_status_importedAt_idx" ON "BankStatementImport"("businessId", "status", "importedAt");
CREATE INDEX "BankStatementImport_businessId_accountId_importedAt_idx" ON "BankStatementImport"("businessId", "accountId", "importedAt");
CREATE INDEX "BankStatementImport_businessId_locationId_importedAt_idx" ON "BankStatementImport"("businessId", "locationId", "importedAt");

CREATE UNIQUE INDEX "BankStatementImportRow_importId_rowNumber_key" ON "BankStatementImportRow"("importId", "rowNumber");
CREATE INDEX "BankStatementImportRow_businessId_postedAt_idx" ON "BankStatementImportRow"("businessId", "postedAt");
CREATE INDEX "BankStatementImportRow_businessId_fingerprint_idx" ON "BankStatementImportRow"("businessId", "fingerprint");
CREATE INDEX "BankStatementImportRow_businessId_status_postedAt_idx" ON "BankStatementImportRow"("businessId", "status", "postedAt");
CREATE INDEX "BankStatementImportRow_importId_status_idx" ON "BankStatementImportRow"("importId", "status");

CREATE INDEX "BankReconciliationMatch_businessId_status_createdAt_idx" ON "BankReconciliationMatch"("businessId", "status", "createdAt");
CREATE INDEX "BankReconciliationMatch_businessId_transactionId_idx" ON "BankReconciliationMatch"("businessId", "transactionId");
CREATE INDEX "BankReconciliationMatch_importId_status_idx" ON "BankReconciliationMatch"("importId", "status");
CREATE INDEX "BankReconciliationMatch_rowId_confidence_idx" ON "BankReconciliationMatch"("rowId", "confidence");

ALTER TABLE "BankStatementImport" ADD CONSTRAINT "BankStatementImport_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BankStatementImport" ADD CONSTRAINT "BankStatementImport_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BankStatementImport" ADD CONSTRAINT "BankStatementImport_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BankStatementImportRow" ADD CONSTRAINT "BankStatementImportRow_importId_fkey"
  FOREIGN KEY ("importId") REFERENCES "BankStatementImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BankReconciliationMatch" ADD CONSTRAINT "BankReconciliationMatch_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BankReconciliationMatch" ADD CONSTRAINT "BankReconciliationMatch_importId_fkey"
  FOREIGN KEY ("importId") REFERENCES "BankStatementImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BankReconciliationMatch" ADD CONSTRAINT "BankReconciliationMatch_rowId_fkey"
  FOREIGN KEY ("rowId") REFERENCES "BankStatementImportRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BankReconciliationMatch" ADD CONSTRAINT "BankReconciliationMatch_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BankReconciliationMatch" ADD CONSTRAINT "BankReconciliationMatch_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
