-- Phase 3L WhatsApp automation governance.
-- Additive only: stores consent, approved-template state, and queued automation jobs.
CREATE TABLE "WhatsAppAutomationContact" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "consentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "consentSource" TEXT,
    "consentedAt" TIMESTAMP(3),
    "optedOutAt" TIMESTAMP(3),
    "tags" TEXT[],
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppAutomationContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppAutomationTemplate" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "templateName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL DEFAULT 'en',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectedReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppAutomationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppAutomationJob" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "contactId" TEXT,
    "phone" TEXT NOT NULL,
    "automationType" TEXT NOT NULL,
    "templateName" TEXT,
    "messagePreview" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "costKobo" INTEGER NOT NULL DEFAULT 0,
    "quietHoursSkipped" BOOLEAN NOT NULL DEFAULT false,
    "optOutCheckedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppAutomationJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppAutomationContact_businessId_phone_key" ON "WhatsAppAutomationContact"("businessId", "phone");
CREATE INDEX "WhatsAppAutomationContact_businessId_consentStatus_idx" ON "WhatsAppAutomationContact"("businessId", "consentStatus");
CREATE INDEX "WhatsAppAutomationContact_businessId_updatedAt_idx" ON "WhatsAppAutomationContact"("businessId", "updatedAt");

CREATE UNIQUE INDEX "WhatsAppAutomationTemplate_businessId_templateName_languageCode_key" ON "WhatsAppAutomationTemplate"("businessId", "templateName", "languageCode");
CREATE INDEX "WhatsAppAutomationTemplate_businessId_status_idx" ON "WhatsAppAutomationTemplate"("businessId", "status");
CREATE INDEX "WhatsAppAutomationTemplate_templateName_languageCode_idx" ON "WhatsAppAutomationTemplate"("templateName", "languageCode");

CREATE INDEX "WhatsAppAutomationJob_businessId_status_scheduledFor_idx" ON "WhatsAppAutomationJob"("businessId", "status", "scheduledFor");
CREATE INDEX "WhatsAppAutomationJob_businessId_automationType_createdAt_idx" ON "WhatsAppAutomationJob"("businessId", "automationType", "createdAt");
CREATE INDEX "WhatsAppAutomationJob_businessId_phone_createdAt_idx" ON "WhatsAppAutomationJob"("businessId", "phone", "createdAt");
CREATE INDEX "WhatsAppAutomationJob_nextRetryAt_idx" ON "WhatsAppAutomationJob"("nextRetryAt");

ALTER TABLE "WhatsAppAutomationContact" ADD CONSTRAINT "WhatsAppAutomationContact_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WhatsAppAutomationTemplate" ADD CONSTRAINT "WhatsAppAutomationTemplate_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WhatsAppAutomationJob" ADD CONSTRAINT "WhatsAppAutomationJob_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WhatsAppAutomationJob" ADD CONSTRAINT "WhatsAppAutomationJob_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "WhatsAppAutomationContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WhatsAppAutomationContact" ADD CONSTRAINT "WhatsAppAutomationContact_consentStatus_check"
  CHECK ("consentStatus" IN ('PENDING', 'OPTED_IN', 'OPTED_OUT'));

ALTER TABLE "WhatsAppAutomationTemplate" ADD CONSTRAINT "WhatsAppAutomationTemplate_status_check"
  CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'PAUSED'));

ALTER TABLE "WhatsAppAutomationJob" ADD CONSTRAINT "WhatsAppAutomationJob_status_check"
  CHECK ("status" IN ('QUEUED', 'SENT', 'FAILED', 'SKIPPED', 'CANCELLED'));

ALTER TABLE "WhatsAppAutomationJob" ADD CONSTRAINT "WhatsAppAutomationJob_retry_cost_check"
  CHECK ("retryCount" >= 0 AND "costKobo" >= 0);
