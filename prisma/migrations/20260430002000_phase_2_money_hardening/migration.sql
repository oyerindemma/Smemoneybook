-- Phase 2 money hardening: append-only reversal links and duplicate fingerprints.
ALTER TABLE "Transaction" ADD COLUMN "duplicateFingerprint" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "reversesTransactionId" TEXT;

CREATE UNIQUE INDEX "Transaction_reversesTransactionId_key" ON "Transaction"("reversesTransactionId");
CREATE UNIQUE INDEX "Transaction_businessId_duplicateFingerprint_key" ON "Transaction"("businessId", "duplicateFingerprint");

ALTER TABLE "Transaction"
ADD CONSTRAINT "Transaction_reversesTransactionId_fkey"
FOREIGN KEY ("reversesTransactionId") REFERENCES "Transaction"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
