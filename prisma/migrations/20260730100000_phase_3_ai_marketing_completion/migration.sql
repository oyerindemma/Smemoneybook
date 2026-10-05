-- Phase 3H AI Marketing completion.
-- Additive only: customer consent fields, campaign governance, recipient preview,
-- message draft, delivery-status placeholders, and opt-out records.

ALTER TABLE "Customer" ADD COLUMN "marketingConsentStatus" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "Customer" ADD COLUMN "marketingConsentSource" TEXT;
ALTER TABLE "Customer" ADD COLUMN "marketingConsentAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN "marketingOptOutAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN "preferredChannel" TEXT NOT NULL DEFAULT 'whatsapp';
ALTER TABLE "Customer" ADD COLUMN "doNotContact" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN "consentNotes" TEXT;

ALTER TABLE "MarketingDraft" ADD COLUMN "campaignId" TEXT;

CREATE TABLE "MarketingCampaign" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "segmentDefinition" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingCampaignRecipient" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "consentStatus" TEXT NOT NULL,
    "eligibilityStatus" TEXT NOT NULL,
    "exclusionReason" TEXT,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'not_sent',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCampaignRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingMessageDraft" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "promptVersion" TEXT,
    "model" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "approvedContentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingMessageDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingDelivery" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerReference" TEXT,
    "attemptedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingOptOut" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingOptOut_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Customer_businessId_marketingConsentStatus_idx" ON "Customer"("businessId", "marketingConsentStatus");
CREATE INDEX "Customer_businessId_doNotContact_idx" ON "Customer"("businessId", "doNotContact");
CREATE INDEX "MarketingDraft_campaignId_idx" ON "MarketingDraft"("campaignId");
CREATE INDEX "MarketingCampaign_businessId_status_createdAt_idx" ON "MarketingCampaign"("businessId", "status", "createdAt");
CREATE INDEX "MarketingCampaign_businessId_channel_createdAt_idx" ON "MarketingCampaign"("businessId", "channel", "createdAt");
CREATE INDEX "MarketingCampaign_createdByUserId_createdAt_idx" ON "MarketingCampaign"("createdByUserId", "createdAt");
CREATE UNIQUE INDEX "MarketingCampaignRecipient_campaignId_customerId_key" ON "MarketingCampaignRecipient"("campaignId", "customerId");
CREATE INDEX "MarketingCampaignRecipient_businessId_eligibilityStatus_createdAt_idx" ON "MarketingCampaignRecipient"("businessId", "eligibilityStatus", "createdAt");
CREATE INDEX "MarketingCampaignRecipient_customerId_createdAt_idx" ON "MarketingCampaignRecipient"("customerId", "createdAt");
CREATE INDEX "MarketingMessageDraft_businessId_campaignId_createdAt_idx" ON "MarketingMessageDraft"("businessId", "campaignId", "createdAt");
CREATE INDEX "MarketingMessageDraft_businessId_channel_createdAt_idx" ON "MarketingMessageDraft"("businessId", "channel", "createdAt");
CREATE INDEX "MarketingDelivery_businessId_status_createdAt_idx" ON "MarketingDelivery"("businessId", "status", "createdAt");
CREATE INDEX "MarketingDelivery_campaignId_status_createdAt_idx" ON "MarketingDelivery"("campaignId", "status", "createdAt");
CREATE INDEX "MarketingDelivery_recipientId_createdAt_idx" ON "MarketingDelivery"("recipientId", "createdAt");
CREATE INDEX "MarketingOptOut_businessId_channel_createdAt_idx" ON "MarketingOptOut"("businessId", "channel", "createdAt");
CREATE INDEX "MarketingOptOut_customerId_channel_createdAt_idx" ON "MarketingOptOut"("customerId", "channel", "createdAt");

ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingCampaignRecipient" ADD CONSTRAINT "MarketingCampaignRecipient_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingCampaignRecipient" ADD CONSTRAINT "MarketingCampaignRecipient_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingCampaignRecipient" ADD CONSTRAINT "MarketingCampaignRecipient_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingMessageDraft" ADD CONSTRAINT "MarketingMessageDraft_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingMessageDraft" ADD CONSTRAINT "MarketingMessageDraft_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingDelivery" ADD CONSTRAINT "MarketingDelivery_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingDelivery" ADD CONSTRAINT "MarketingDelivery_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingDelivery" ADD CONSTRAINT "MarketingDelivery_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "MarketingCampaignRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingOptOut" ADD CONSTRAINT "MarketingOptOut_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingOptOut" ADD CONSTRAINT "MarketingOptOut_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingDraft" ADD CONSTRAINT "MarketingDraft_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_marketingConsentStatus_check"
  CHECK ("marketingConsentStatus" IN ('unknown', 'consented', 'opted_out', 'transactional_only'));

ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_status_check"
  CHECK ("status" IN ('draft', 'approved', 'send_disabled', 'sent', 'archived'));

ALTER TABLE "MarketingCampaignRecipient" ADD CONSTRAINT "MarketingCampaignRecipient_eligibilityStatus_check"
  CHECK ("eligibilityStatus" IN ('eligible', 'excluded'));

ALTER TABLE "MarketingCampaignRecipient" ADD CONSTRAINT "MarketingCampaignRecipient_deliveryStatus_check"
  CHECK ("deliveryStatus" IN ('not_sent', 'disabled', 'queued', 'sent', 'delivered', 'failed'));

ALTER TABLE "MarketingDelivery" ADD CONSTRAINT "MarketingDelivery_status_check"
  CHECK ("status" IN ('disabled', 'queued', 'sent', 'delivered', 'failed'));
