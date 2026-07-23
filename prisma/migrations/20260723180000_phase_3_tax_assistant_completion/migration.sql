-- Phase 3C Tax Assistant completion.
-- Additive only: versioned tax rules, extended tax profile, read-only review/chat records, and optional transaction tax metadata.

ALTER TABLE "Transaction" ADD COLUMN "taxTreatment" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "taxMetadata" JSONB;
ALTER TABLE "Transaction" ADD COLUMN "vatInclusive" BOOLEAN;
ALTER TABLE "Transaction" ADD COLUMN "withholdingTaxRate" DECIMAL(65,30);
ALTER TABLE "Transaction" ADD COLUMN "withholdingTaxAmount" DECIMAL(65,30);
ALTER TABLE "Transaction" ADD COLUMN "receiptId" TEXT;

CREATE TABLE "TaxRuleSet" (
    "id" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sourceTitle" TEXT NOT NULL,
    "sourceAuthority" TEXT NOT NULL,
    "sourcePublicationDate" TIMESTAMP(3),
    "sourceReference" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3),
    "verificationOwner" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRuleSet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaxRule" (
    "id" TEXT NOT NULL,
    "ruleSetId" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "taxType" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "threshold" DECIMAL(65,30),
    "formulaConfig" JSONB NOT NULL,
    "applicabilityConfig" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sourceTitle" TEXT NOT NULL,
    "sourceAuthority" TEXT NOT NULL,
    "sourcePublicationDate" TIMESTAMP(3),
    "sourceReference" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3),
    "verificationOwner" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BusinessTaxProfile" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL DEFAULT 'NG-FED',
    "taxIdentificationNumber" TEXT,
    "vatRegistered" BOOLEAN NOT NULL DEFAULT false,
    "vatRegistrationDate" TIMESTAMP(3),
    "filingFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'NGN',
    "pricingMode" TEXT NOT NULL DEFAULT 'tax_exclusive',
    "whtApplicable" BOOLEAN NOT NULL DEFAULT false,
    "businessType" TEXT,
    "industryCategory" TEXT,
    "taxRuleSetId" TEXT NOT NULL,
    "accountantName" TEXT,
    "accountantEmail" TEXT,
    "accountantPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessTaxProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaxPeriodSnapshot" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "taxType" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "ruleSetId" TEXT,
    "ruleSetVersion" TEXT NOT NULL,
    "taxableBase" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "estimatedTax" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "adjustments" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generated',
    "generatedByUserId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "TaxPeriodSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaxReviewItem" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "transactionId" TEXT,
    "taxType" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxReviewItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaxAssistantConversation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxAssistantConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaxAssistantMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "promptVersion" TEXT,
    "toolCalls" JSONB,
    "citations" JSONB,
    "tokenUsage" JSONB,
    "estimatedCost" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxAssistantMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaxRuleSet_jurisdiction_version_key" ON "TaxRuleSet"("jurisdiction", "version");
CREATE INDEX "TaxRuleSet_jurisdiction_status_effectiveFrom_idx" ON "TaxRuleSet"("jurisdiction", "status", "effectiveFrom");

CREATE INDEX "TaxRule_ruleSetId_taxType_transactionType_idx" ON "TaxRule"("ruleSetId", "taxType", "transactionType");
CREATE INDEX "TaxRule_jurisdiction_taxType_status_effectiveFrom_idx" ON "TaxRule"("jurisdiction", "taxType", "status", "effectiveFrom");

CREATE UNIQUE INDEX "BusinessTaxProfile_businessId_key" ON "BusinessTaxProfile"("businessId");
CREATE INDEX "BusinessTaxProfile_businessId_jurisdiction_idx" ON "BusinessTaxProfile"("businessId", "jurisdiction");
CREATE INDEX "BusinessTaxProfile_taxRuleSetId_idx" ON "BusinessTaxProfile"("taxRuleSetId");

CREATE INDEX "TaxPeriodSnapshot_businessId_taxType_periodStart_periodEnd_idx" ON "TaxPeriodSnapshot"("businessId", "taxType", "periodStart", "periodEnd");
CREATE INDEX "TaxPeriodSnapshot_businessId_generatedAt_idx" ON "TaxPeriodSnapshot"("businessId", "generatedAt");
CREATE INDEX "TaxPeriodSnapshot_ruleSetId_idx" ON "TaxPeriodSnapshot"("ruleSetId");

CREATE INDEX "TaxReviewItem_businessId_status_severity_idx" ON "TaxReviewItem"("businessId", "status", "severity");
CREATE INDEX "TaxReviewItem_businessId_issueType_createdAt_idx" ON "TaxReviewItem"("businessId", "issueType", "createdAt");
CREATE INDEX "TaxReviewItem_transactionId_idx" ON "TaxReviewItem"("transactionId");

CREATE INDEX "TaxAssistantConversation_businessId_updatedAt_idx" ON "TaxAssistantConversation"("businessId", "updatedAt");
CREATE INDEX "TaxAssistantConversation_userId_updatedAt_idx" ON "TaxAssistantConversation"("userId", "updatedAt");

CREATE INDEX "TaxAssistantMessage_conversationId_createdAt_idx" ON "TaxAssistantMessage"("conversationId", "createdAt");
CREATE INDEX "TaxAssistantMessage_businessId_createdAt_idx" ON "TaxAssistantMessage"("businessId", "createdAt");
CREATE INDEX "TaxAssistantMessage_userId_createdAt_idx" ON "TaxAssistantMessage"("userId", "createdAt");

CREATE INDEX "Transaction_businessId_taxTreatment_occurredAt_idx" ON "Transaction"("businessId", "taxTreatment", "occurredAt");

ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_ruleSetId_fkey"
  FOREIGN KEY ("ruleSetId") REFERENCES "TaxRuleSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusinessTaxProfile" ADD CONSTRAINT "BusinessTaxProfile_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusinessTaxProfile" ADD CONSTRAINT "BusinessTaxProfile_taxRuleSetId_fkey"
  FOREIGN KEY ("taxRuleSetId") REFERENCES "TaxRuleSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TaxPeriodSnapshot" ADD CONSTRAINT "TaxPeriodSnapshot_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaxPeriodSnapshot" ADD CONSTRAINT "TaxPeriodSnapshot_ruleSetId_fkey"
  FOREIGN KEY ("ruleSetId") REFERENCES "TaxRuleSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TaxPeriodSnapshot" ADD CONSTRAINT "TaxPeriodSnapshot_generatedByUserId_fkey"
  FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TaxReviewItem" ADD CONSTRAINT "TaxReviewItem_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaxReviewItem" ADD CONSTRAINT "TaxReviewItem_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TaxReviewItem" ADD CONSTRAINT "TaxReviewItem_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TaxAssistantConversation" ADD CONSTRAINT "TaxAssistantConversation_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaxAssistantConversation" ADD CONSTRAINT "TaxAssistantConversation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaxAssistantMessage" ADD CONSTRAINT "TaxAssistantMessage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "TaxAssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaxAssistantMessage" ADD CONSTRAINT "TaxAssistantMessage_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaxAssistantMessage" ADD CONSTRAINT "TaxAssistantMessage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "TaxRuleSet" (
  "id",
  "jurisdiction",
  "version",
  "effectiveFrom",
  "status",
  "sourceTitle",
  "sourceAuthority",
  "sourcePublicationDate",
  "sourceReference",
  "lastVerifiedAt",
  "verificationOwner",
  "updatedAt"
) VALUES (
  'tax_ruleset_ng_federal_2026_preview_v1',
  'NG-FED',
  'ng-federal-2026-preview-v1',
  '2026-01-01T00:00:00.000Z',
  'verified',
  'Nigeria Tax Act 2025 and Nigeria Revenue Service guidance',
  'Nigeria Revenue Service',
  '2025-06-26T00:00:00.000Z',
  'https://www.nrs.gov.ng/uploads/NIGERIA_TAX_ACT_2025_ef6bb812a5.pdf',
  '2026-07-23T00:00:00.000Z',
  'SME MoneyBook engineering',
  CURRENT_TIMESTAMP
);

INSERT INTO "TaxRule" (
  "id",
  "ruleSetId",
  "jurisdiction",
  "taxType",
  "transactionType",
  "rate",
  "threshold",
  "formulaConfig",
  "applicabilityConfig",
  "effectiveFrom",
  "status",
  "sourceTitle",
  "sourceAuthority",
  "sourcePublicationDate",
  "sourceReference",
  "lastVerifiedAt",
  "verificationOwner",
  "updatedAt"
) VALUES
(
  'tax_rule_ng_vat_output_2026_v1',
  'tax_ruleset_ng_federal_2026_preview_v1',
  'NG-FED',
  'VAT',
  'SALE',
  7.5,
  0,
  '{"method":"percent_of_taxable_base","inclusiveFormula":"gross - gross / (1 + rate)","exclusiveFormula":"base * rate"}',
  '{"requiresVatRegistered":true,"requiresTaxTreatment":["taxable"],"excludedTransactionTypes":["TRANSFER","ADJUSTMENT"],"excludeReversed":true}',
  '2026-01-01T00:00:00.000Z',
  'verified',
  'Nigeria Tax Act 2025',
  'Nigeria Revenue Service',
  '2025-06-26T00:00:00.000Z',
  'https://www.nrs.gov.ng/uploads/NIGERIA_TAX_ACT_2025_ef6bb812a5.pdf',
  '2026-07-23T00:00:00.000Z',
  'SME MoneyBook engineering',
  CURRENT_TIMESTAMP
),
(
  'tax_rule_ng_vat_input_2026_v1',
  'tax_ruleset_ng_federal_2026_preview_v1',
  'NG-FED',
  'VAT_INPUT',
  'EXPENSE',
  7.5,
  0,
  '{"method":"percent_of_eligible_expense_base","inclusiveFormula":"gross - gross / (1 + rate)","exclusiveFormula":"base * rate"}',
  '{"requiresVatRegistered":true,"requiresTaxTreatment":["taxable"],"excludeMissingReceiptFromConfidence":true,"excludeReversed":true}',
  '2026-01-01T00:00:00.000Z',
  'verified',
  'Nigeria Tax Act 2025',
  'Nigeria Revenue Service',
  '2025-06-26T00:00:00.000Z',
  'https://www.nrs.gov.ng/uploads/NIGERIA_TAX_ACT_2025_ef6bb812a5.pdf',
  '2026-07-23T00:00:00.000Z',
  'SME MoneyBook engineering',
  CURRENT_TIMESTAMP
),
(
  'tax_rule_ng_wht_recorded_2026_v1',
  'tax_ruleset_ng_federal_2026_preview_v1',
  'NG-FED',
  'WHT',
  'RECORDED_ONLY',
  0,
  0,
  '{"method":"recorded_transaction_withholding_amount_or_rate","fallback":"requires_review"}',
  '{"doNotInferFromDescription":true,"requiresExplicitTransactionMetadata":true}',
  '2026-01-01T00:00:00.000Z',
  'verified',
  'Nigeria Revenue Service withholding-tax guidance',
  'Nigeria Revenue Service',
  '2026-07-23T00:00:00.000Z',
  'https://www.nrs.gov.ng/page/withholding-tax',
  '2026-07-23T00:00:00.000Z',
  'SME MoneyBook engineering',
  CURRENT_TIMESTAMP
);
