-- Phase 5 reporting: saved decision-ready report snapshots.
CREATE TABLE "ReportSnapshot" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "data" JSONB NOT NULL,
    "businessId" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReportSnapshot_businessId_periodStart_periodEnd_idx"
ON "ReportSnapshot"("businessId", "periodStart", "periodEnd");

ALTER TABLE "ReportSnapshot"
ADD CONSTRAINT "ReportSnapshot_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReportSnapshot"
ADD CONSTRAINT "ReportSnapshot_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
