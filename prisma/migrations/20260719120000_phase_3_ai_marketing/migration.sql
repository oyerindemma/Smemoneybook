-- Phase 3M AI marketing assistant.
-- Additive only: stores draft-only marketing content and feedback; no sending workflow.
CREATE TABLE "MarketingDraft" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT,
    "channel" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT,
    "offer" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "content" TEXT NOT NULL,
    "safetyWarnings" JSONB NOT NULL,
    "sourceInputs" JSONB NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "createdById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingDraftFeedback" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "actorId" TEXT,
    "rating" TEXT NOT NULL,
    "helpful" BOOLEAN,
    "correction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingDraftFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketingDraft_businessId_status_createdAt_idx" ON "MarketingDraft"("businessId", "status", "createdAt");
CREATE INDEX "MarketingDraft_businessId_channel_createdAt_idx" ON "MarketingDraft"("businessId", "channel", "createdAt");
CREATE INDEX "MarketingDraft_businessId_locationId_createdAt_idx" ON "MarketingDraft"("businessId", "locationId", "createdAt");

CREATE INDEX "MarketingDraftFeedback_businessId_createdAt_idx" ON "MarketingDraftFeedback"("businessId", "createdAt");
CREATE INDEX "MarketingDraftFeedback_draftId_createdAt_idx" ON "MarketingDraftFeedback"("draftId", "createdAt");
CREATE INDEX "MarketingDraftFeedback_businessId_rating_createdAt_idx" ON "MarketingDraftFeedback"("businessId", "rating", "createdAt");

ALTER TABLE "MarketingDraft" ADD CONSTRAINT "MarketingDraft_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingDraft" ADD CONSTRAINT "MarketingDraft_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MarketingDraftFeedback" ADD CONSTRAINT "MarketingDraftFeedback_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingDraftFeedback" ADD CONSTRAINT "MarketingDraftFeedback_draftId_fkey"
  FOREIGN KEY ("draftId") REFERENCES "MarketingDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingDraft" ADD CONSTRAINT "MarketingDraft_status_check"
  CHECK ("status" IN ('DRAFT', 'APPROVED', 'REJECTED', 'ARCHIVED'));
