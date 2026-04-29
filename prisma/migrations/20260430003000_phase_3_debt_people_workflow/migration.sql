-- Phase 3 debt control: event history for reminders, partial collections and supplier settlements.
CREATE TYPE "DebtEventType" AS ENUM ('REMINDER', 'CUSTOMER_COLLECTION', 'SUPPLIER_SETTLEMENT', 'NOTE');

CREATE TABLE "DebtEvent" (
    "id" TEXT NOT NULL,
    "type" "DebtEventType" NOT NULL,
    "amount" DECIMAL(65,30),
    "note" TEXT,
    "channel" TEXT,
    "debtId" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DebtEvent_debtId_createdAt_idx" ON "DebtEvent"("debtId", "createdAt");

ALTER TABLE "DebtEvent"
ADD CONSTRAINT "DebtEvent_debtId_fkey"
FOREIGN KEY ("debtId") REFERENCES "Debt"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DebtEvent"
ADD CONSTRAINT "DebtEvent_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
