CREATE TABLE "PredictiveAlert" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT,
    "alertKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "status" TEXT NOT NULL DEFAULT 'active',
    "confidence" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "impactAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "recommendedAction" TEXT,
    "sourcePeriodStart" TIMESTAMP(3) NOT NULL,
    "sourcePeriodEnd" TIMESTAMP(3) NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceMetrics" JSONB NOT NULL,
    "dismissedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "markedIncorrectAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "lastFeedbackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PredictiveAlert_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PredictiveAlert_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1),
    CONSTRAINT "PredictiveAlert_severity_check" CHECK ("severity" IN ('info', 'warning', 'critical')),
    CONSTRAINT "PredictiveAlert_status_check" CHECK ("status" IN ('active', 'dismissed', 'confirmed', 'incorrect', 'resolved')),
    CONSTRAINT "PredictiveAlert_period_check" CHECK ("sourcePeriodEnd" > "sourcePeriodStart")
);

CREATE TABLE "PredictiveAlertFeedback" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "actorId" TEXT,
    "response" TEXT NOT NULL,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PredictiveAlertFeedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PredictiveAlertFeedback_response_check" CHECK ("response" IN ('dismissed', 'confirmed', 'incorrect', 'resolved'))
);

CREATE TABLE "AiEvaluationEvent" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "actorId" TEXT,
    "feature" TEXT NOT NULL,
    "artifactType" TEXT NOT NULL,
    "artifactId" TEXT,
    "eventType" TEXT NOT NULL,
    "rating" TEXT,
    "accepted" BOOLEAN,
    "correct" BOOLEAN,
    "correction" TEXT,
    "modelVersion" TEXT,
    "promptVersion" TEXT,
    "toolName" TEXT,
    "latencyMs" INTEGER,
    "costKobo" INTEGER,
    "safetyLabel" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiEvaluationEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AiEvaluationEvent_latency_check" CHECK ("latencyMs" IS NULL OR "latencyMs" >= 0),
    CONSTRAINT "AiEvaluationEvent_cost_check" CHECK ("costKobo" IS NULL OR "costKobo" >= 0)
);

CREATE TABLE "AiEvaluationDataset" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "purpose" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "retentionPolicy" TEXT NOT NULL,
    "piiRedacted" BOOLEAN NOT NULL DEFAULT true,
    "consentRequired" BOOLEAN NOT NULL DEFAULT true,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiEvaluationDataset_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AiEvaluationDataset_sample_count_check" CHECK ("sampleCount" >= 0)
);

CREATE TABLE "AiEvaluationRun" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT,
    "businessId" TEXT,
    "modelVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "evaluatorVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "metrics" JSONB NOT NULL,
    "safetyFindings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiEvaluationRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AiEvaluationRun_status_check" CHECK ("status" IN ('queued', 'running', 'completed', 'failed'))
);

CREATE UNIQUE INDEX "PredictiveAlert_businessId_alertKey_key" ON "PredictiveAlert"("businessId", "alertKey");
CREATE INDEX "PredictiveAlert_businessId_status_detectedAt_idx" ON "PredictiveAlert"("businessId", "status", "detectedAt");
CREATE INDEX "PredictiveAlert_businessId_type_detectedAt_idx" ON "PredictiveAlert"("businessId", "type", "detectedAt");
CREATE INDEX "PredictiveAlert_businessId_severity_detectedAt_idx" ON "PredictiveAlert"("businessId", "severity", "detectedAt");
CREATE INDEX "PredictiveAlert_businessId_locationId_detectedAt_idx" ON "PredictiveAlert"("businessId", "locationId", "detectedAt");

CREATE INDEX "PredictiveAlertFeedback_businessId_response_createdAt_idx" ON "PredictiveAlertFeedback"("businessId", "response", "createdAt");
CREATE INDEX "PredictiveAlertFeedback_alertId_createdAt_idx" ON "PredictiveAlertFeedback"("alertId", "createdAt");
CREATE INDEX "PredictiveAlertFeedback_actorId_createdAt_idx" ON "PredictiveAlertFeedback"("actorId", "createdAt");

CREATE INDEX "AiEvaluationEvent_businessId_createdAt_idx" ON "AiEvaluationEvent"("businessId", "createdAt");
CREATE INDEX "AiEvaluationEvent_feature_createdAt_idx" ON "AiEvaluationEvent"("feature", "createdAt");
CREATE INDEX "AiEvaluationEvent_eventType_createdAt_idx" ON "AiEvaluationEvent"("eventType", "createdAt");
CREATE INDEX "AiEvaluationEvent_artifactType_artifactId_idx" ON "AiEvaluationEvent"("artifactType", "artifactId");
CREATE INDEX "AiEvaluationEvent_toolName_createdAt_idx" ON "AiEvaluationEvent"("toolName", "createdAt");

CREATE INDEX "AiEvaluationDataset_businessId_createdAt_idx" ON "AiEvaluationDataset"("businessId", "createdAt");
CREATE INDEX "AiEvaluationDataset_purpose_createdAt_idx" ON "AiEvaluationDataset"("purpose", "createdAt");

CREATE INDEX "AiEvaluationRun_businessId_createdAt_idx" ON "AiEvaluationRun"("businessId", "createdAt");
CREATE INDEX "AiEvaluationRun_datasetId_createdAt_idx" ON "AiEvaluationRun"("datasetId", "createdAt");
CREATE INDEX "AiEvaluationRun_modelVersion_promptVersion_createdAt_idx" ON "AiEvaluationRun"("modelVersion", "promptVersion", "createdAt");
CREATE INDEX "AiEvaluationRun_status_createdAt_idx" ON "AiEvaluationRun"("status", "createdAt");

ALTER TABLE "PredictiveAlert" ADD CONSTRAINT "PredictiveAlert_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PredictiveAlert" ADD CONSTRAINT "PredictiveAlert_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PredictiveAlertFeedback" ADD CONSTRAINT "PredictiveAlertFeedback_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "PredictiveAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PredictiveAlertFeedback" ADD CONSTRAINT "PredictiveAlertFeedback_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PredictiveAlertFeedback" ADD CONSTRAINT "PredictiveAlertFeedback_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiEvaluationEvent" ADD CONSTRAINT "AiEvaluationEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiEvaluationEvent" ADD CONSTRAINT "AiEvaluationEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiEvaluationDataset" ADD CONSTRAINT "AiEvaluationDataset_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiEvaluationRun" ADD CONSTRAINT "AiEvaluationRun_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "AiEvaluationDataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiEvaluationRun" ADD CONSTRAINT "AiEvaluationRun_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
