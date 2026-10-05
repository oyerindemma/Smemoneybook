ALTER TABLE "AiEvaluationRun"
ADD COLUMN "suiteId" TEXT,
ADD COLUMN "model" TEXT,
ADD COLUMN "toolVersion" TEXT,
ADD COLUMN "datasetVersion" TEXT,
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "initiatedByUserId" TEXT,
ADD COLUMN "summary" JSONB,
ADD COLUMN "totalCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
ADD COLUMN "totalTokens" INTEGER NOT NULL DEFAULT 0;

UPDATE "AiEvaluationRun"
SET
  "model" = "modelVersion",
  "toolVersion" = "evaluatorVersion",
  "datasetVersion" = COALESCE("datasetVersion", 'legacy-telemetry-v1'),
  "summary" = COALESCE("summary", "metrics")
WHERE "model" IS NULL;

CREATE TABLE "AiEvaluationSuite" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetFeature" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "datasetVersion" TEXT NOT NULL DEFAULT 'phase3f-synthetic-v1',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiEvaluationSuite_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AiEvaluationSuite_status_check" CHECK ("status" IN ('draft', 'active', 'archived'))
);

CREATE TABLE "AiEvaluationCase" (
    "id" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "fixtureReference" TEXT NOT NULL,
    "expectedToolNames" TEXT[] NOT NULL,
    "forbiddenToolNames" TEXT[] NOT NULL,
    "expectedFacts" JSONB,
    "expectedRefusal" BOOLEAN NOT NULL DEFAULT false,
    "scoringConfig" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiEvaluationCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiEvaluationResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "toolCalls" JSONB NOT NULL,
    "citations" JSONB NOT NULL,
    "scores" JSONB NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "tokenUsage" JSONB NOT NULL,
    "estimatedCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiEvaluationResult_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AiEvaluationResult_status_check" CHECK ("status" IN ('passed', 'failed', 'needs_review', 'critical_failure')),
    CONSTRAINT "AiEvaluationResult_latency_check" CHECK ("latencyMs" >= 0),
    CONSTRAINT "AiEvaluationResult_cost_check" CHECK ("estimatedCost" >= 0)
);

CREATE TABLE "AiEvaluationBaseline" (
    "id" TEXT NOT NULL,
    "targetFeature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "datasetVersion" TEXT NOT NULL,
    "acceptedRunId" TEXT NOT NULL,
    "acceptedByUserId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "businessId" TEXT,

    CONSTRAINT "AiEvaluationBaseline_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiEvaluationRun_suiteId_createdAt_idx" ON "AiEvaluationRun"("suiteId", "createdAt");
CREATE INDEX "AiEvaluationRun_initiatedByUserId_createdAt_idx" ON "AiEvaluationRun"("initiatedByUserId", "createdAt");

CREATE INDEX "AiEvaluationSuite_businessId_createdAt_idx" ON "AiEvaluationSuite"("businessId", "createdAt");
CREATE INDEX "AiEvaluationSuite_targetFeature_status_createdAt_idx" ON "AiEvaluationSuite"("targetFeature", "status", "createdAt");
CREATE INDEX "AiEvaluationSuite_createdByUserId_createdAt_idx" ON "AiEvaluationSuite"("createdByUserId", "createdAt");

CREATE UNIQUE INDEX "AiEvaluationCase_suiteId_key_key" ON "AiEvaluationCase"("suiteId", "key");
CREATE INDEX "AiEvaluationCase_suiteId_category_idx" ON "AiEvaluationCase"("suiteId", "category");

CREATE UNIQUE INDEX "AiEvaluationResult_runId_caseId_key" ON "AiEvaluationResult"("runId", "caseId");
CREATE INDEX "AiEvaluationResult_caseId_createdAt_idx" ON "AiEvaluationResult"("caseId", "createdAt");
CREATE INDEX "AiEvaluationResult_runId_status_idx" ON "AiEvaluationResult"("runId", "status");

CREATE UNIQUE INDEX "AiEvaluationBaseline_businessId_targetFeature_model_promptVersion_datasetVersion_key" ON "AiEvaluationBaseline"("businessId", "targetFeature", "model", "promptVersion", "datasetVersion");
CREATE INDEX "AiEvaluationBaseline_acceptedRunId_idx" ON "AiEvaluationBaseline"("acceptedRunId");
CREATE INDEX "AiEvaluationBaseline_acceptedByUserId_acceptedAt_idx" ON "AiEvaluationBaseline"("acceptedByUserId", "acceptedAt");
CREATE INDEX "AiEvaluationBaseline_targetFeature_acceptedAt_idx" ON "AiEvaluationBaseline"("targetFeature", "acceptedAt");

ALTER TABLE "AiEvaluationRun" ADD CONSTRAINT "AiEvaluationRun_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "AiEvaluationSuite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiEvaluationRun" ADD CONSTRAINT "AiEvaluationRun_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiEvaluationSuite" ADD CONSTRAINT "AiEvaluationSuite_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiEvaluationSuite" ADD CONSTRAINT "AiEvaluationSuite_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiEvaluationCase" ADD CONSTRAINT "AiEvaluationCase_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "AiEvaluationSuite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiEvaluationResult" ADD CONSTRAINT "AiEvaluationResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiEvaluationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiEvaluationResult" ADD CONSTRAINT "AiEvaluationResult_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "AiEvaluationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiEvaluationBaseline" ADD CONSTRAINT "AiEvaluationBaseline_acceptedRunId_fkey" FOREIGN KEY ("acceptedRunId") REFERENCES "AiEvaluationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiEvaluationBaseline" ADD CONSTRAINT "AiEvaluationBaseline_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiEvaluationBaseline" ADD CONSTRAINT "AiEvaluationBaseline_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
