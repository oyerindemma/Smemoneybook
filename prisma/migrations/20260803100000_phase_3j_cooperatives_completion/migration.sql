-- Phase 3J Cooperatives completion. Additive Preview-ready schema only.

ALTER TABLE "CooperativeGroup"
  ADD COLUMN "registrationReference" TEXT,
  ADD COLUMN "fiscalYearStart" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "memberSelfViewEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requireGuarantors" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "minimumGuarantors" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "interestPolicy" JSONB,
  ADD COLUMN "transferPolicy" JSONB;

ALTER TABLE "CooperativeMember"
  ADD COLUMN "memberNumber" TEXT,
  ADD COLUMN "fullName" TEXT,
  ADD COLUMN "sensitiveMetadata" JSONB;

ALTER TABLE "CooperativeContributionPlan"
  ADD COLUMN "endDate" TIMESTAMP(3),
  ADD COLUMN "mandatory" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "CooperativeContribution"
  ADD COLUMN "paymentReference" TEXT,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "reversedAt" TIMESTAMP(3),
  ADD COLUMN "reversalReason" TEXT,
  ADD COLUMN "reversalOfId" TEXT;

ALTER TABLE "CooperativeLoan"
  ADD COLUMN "approvedAmount" DECIMAL(65,30),
  ADD COLUMN "interestRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "interestMethod" TEXT NOT NULL DEFAULT 'zero',
  ADD COLUMN "termCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "repaymentFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN "purpose" TEXT,
  ADD COLUMN "applicationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedByUserId" TEXT,
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "disbursementReference" TEXT,
  ADD COLUMN "disbursedRecordedByUserId" TEXT,
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "idempotencyKey" TEXT;

ALTER TABLE "CooperativeLoanGuarantor"
  ADD COLUMN "guaranteeAmount" DECIMAL(65,30),
  ADD COLUMN "confirmedAt" TIMESTAMP(3);

ALTER TABLE "CooperativeLoanRepayment"
  ADD COLUMN "scheduleId" TEXT,
  ADD COLUMN "repaymentDate" TIMESTAMP(3),
  ADD COLUMN "paymentReference" TEXT,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'RECORDED',
  ADD COLUMN "reversedAt" TIMESTAMP(3),
  ADD COLUMN "reversalReason" TEXT;

ALTER TABLE "CooperativeLedgerEntry"
  ADD COLUMN "batchId" TEXT,
  ADD COLUMN "accountId" TEXT,
  ADD COLUMN "accountCode" TEXT,
  ADD COLUMN "sourceType" TEXT,
  ADD COLUMN "sourceId" TEXT,
  ADD COLUMN "reversalOfId" TEXT,
  ADD COLUMN "postedByUserId" TEXT,
  ADD COLUMN "postedAt" TIMESTAMP(3);

CREATE TABLE "CooperativeLedgerAccount" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "accountType" TEXT NOT NULL,
  "normalBalance" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CooperativeLedgerAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CooperativeLedgerBatch" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "idempotencyKey" TEXT,
  "memo" TEXT,
  "reversalOfId" TEXT,
  "postedByUserId" TEXT,
  "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CooperativeLedgerBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CooperativeRepaymentSchedule" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "loanId" TEXT NOT NULL,
  "instalmentNumber" INTEGER NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "principalDue" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "interestDue" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "penaltyDue" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "totalDue" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "paidAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CooperativeRepaymentSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CooperativeApprovalAction" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorId" TEXT,
  "reason" TEXT,
  "metadata" JSONB,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CooperativeApprovalAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CooperativeLedgerTransfer" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "cooperativeLedgerBatchId" TEXT,
  "businessTransactionId" TEXT,
  "direction" TEXT NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "status" TEXT NOT NULL DEFAULT 'RECORDED',
  "memo" TEXT,
  "reference" TEXT,
  "requestedByUserId" TEXT,
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CooperativeLedgerTransfer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CooperativeMember_groupId_memberNumber_key" ON "CooperativeMember"("groupId", "memberNumber");
CREATE UNIQUE INDEX "CooperativeContribution_businessId_idempotencyKey_key" ON "CooperativeContribution"("businessId", "idempotencyKey");
CREATE UNIQUE INDEX "CooperativeLoan_businessId_idempotencyKey_key" ON "CooperativeLoan"("businessId", "idempotencyKey");
CREATE UNIQUE INDEX "CooperativeLoanRepayment_businessId_idempotencyKey_key" ON "CooperativeLoanRepayment"("businessId", "idempotencyKey");
CREATE UNIQUE INDEX "CooperativeLedgerAccount_groupId_code_key" ON "CooperativeLedgerAccount"("groupId", "code");
CREATE UNIQUE INDEX "CooperativeLedgerBatch_businessId_idempotencyKey_key" ON "CooperativeLedgerBatch"("businessId", "idempotencyKey");
CREATE UNIQUE INDEX "CooperativeRepaymentSchedule_loanId_instalmentNumber_key" ON "CooperativeRepaymentSchedule"("loanId", "instalmentNumber");

CREATE INDEX "CooperativeGroup_businessId_registrationReference_idx" ON "CooperativeGroup"("businessId", "registrationReference");
CREATE INDEX "CooperativeLoanRepayment_scheduleId_idx" ON "CooperativeLoanRepayment"("scheduleId");
CREATE INDEX "CooperativeLedgerEntry_groupId_accountCode_entryDate_idx" ON "CooperativeLedgerEntry"("groupId", "accountCode", "entryDate");
CREATE INDEX "CooperativeLedgerEntry_batchId_idx" ON "CooperativeLedgerEntry"("batchId");
CREATE INDEX "CooperativeLedgerAccount_businessId_groupId_active_idx" ON "CooperativeLedgerAccount"("businessId", "groupId", "active");
CREATE INDEX "CooperativeLedgerBatch_businessId_groupId_postedAt_idx" ON "CooperativeLedgerBatch"("businessId", "groupId", "postedAt");
CREATE INDEX "CooperativeLedgerBatch_groupId_eventType_postedAt_idx" ON "CooperativeLedgerBatch"("groupId", "eventType", "postedAt");
CREATE INDEX "CooperativeLedgerBatch_businessId_sourceType_sourceId_idx" ON "CooperativeLedgerBatch"("businessId", "sourceType", "sourceId");
CREATE INDEX "CooperativeRepaymentSchedule_businessId_groupId_dueDate_status_idx" ON "CooperativeRepaymentSchedule"("businessId", "groupId", "dueDate", "status");
CREATE INDEX "CooperativeRepaymentSchedule_groupId_loanId_dueDate_idx" ON "CooperativeRepaymentSchedule"("groupId", "loanId", "dueDate");
CREATE INDEX "CooperativeApprovalAction_businessId_groupId_recordedAt_idx" ON "CooperativeApprovalAction"("businessId", "groupId", "recordedAt");
CREATE INDEX "CooperativeApprovalAction_groupId_targetType_targetId_idx" ON "CooperativeApprovalAction"("groupId", "targetType", "targetId");
CREATE INDEX "CooperativeApprovalAction_businessId_action_recordedAt_idx" ON "CooperativeApprovalAction"("businessId", "action", "recordedAt");
CREATE INDEX "CooperativeLedgerTransfer_businessId_groupId_recordedAt_idx" ON "CooperativeLedgerTransfer"("businessId", "groupId", "recordedAt");
CREATE INDEX "CooperativeLedgerTransfer_groupId_direction_status_idx" ON "CooperativeLedgerTransfer"("groupId", "direction", "status");
CREATE INDEX "CooperativeLedgerTransfer_businessTransactionId_idx" ON "CooperativeLedgerTransfer"("businessTransactionId");
CREATE INDEX "CooperativeLedgerTransfer_cooperativeLedgerBatchId_idx" ON "CooperativeLedgerTransfer"("cooperativeLedgerBatchId");

ALTER TABLE "CooperativeLedgerAccount" ADD CONSTRAINT "CooperativeLedgerAccount_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CooperativeLedgerAccount" ADD CONSTRAINT "CooperativeLedgerAccount_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CooperativeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CooperativeLedgerBatch" ADD CONSTRAINT "CooperativeLedgerBatch_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CooperativeLedgerBatch" ADD CONSTRAINT "CooperativeLedgerBatch_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CooperativeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CooperativeRepaymentSchedule" ADD CONSTRAINT "CooperativeRepaymentSchedule_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CooperativeRepaymentSchedule" ADD CONSTRAINT "CooperativeRepaymentSchedule_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CooperativeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CooperativeRepaymentSchedule" ADD CONSTRAINT "CooperativeRepaymentSchedule_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "CooperativeLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CooperativeApprovalAction" ADD CONSTRAINT "CooperativeApprovalAction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CooperativeApprovalAction" ADD CONSTRAINT "CooperativeApprovalAction_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CooperativeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CooperativeLedgerTransfer" ADD CONSTRAINT "CooperativeLedgerTransfer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CooperativeLedgerTransfer" ADD CONSTRAINT "CooperativeLedgerTransfer_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CooperativeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CooperativeLedgerTransfer" ADD CONSTRAINT "CooperativeLedgerTransfer_cooperativeLedgerBatchId_fkey" FOREIGN KEY ("cooperativeLedgerBatchId") REFERENCES "CooperativeLedgerBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CooperativeLedgerTransfer" ADD CONSTRAINT "CooperativeLedgerTransfer_businessTransactionId_fkey" FOREIGN KEY ("businessTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CooperativeLoanRepayment" ADD CONSTRAINT "CooperativeLoanRepayment_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "CooperativeRepaymentSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CooperativeLedgerEntry" ADD CONSTRAINT "CooperativeLedgerEntry_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CooperativeLedgerBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CooperativeLedgerEntry" ADD CONSTRAINT "CooperativeLedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CooperativeLedgerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
