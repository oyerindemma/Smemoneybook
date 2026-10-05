-- Phase 3I cooperative and savings groups.
-- Additive only: cooperative funds live in separate tables from the normal business ledger.
CREATE TABLE "CooperativeGroup" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "contributionCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
    "loanApprovalMode" TEXT NOT NULL DEFAULT 'committee',
    "dividendRule" TEXT NOT NULL DEFAULT 'proportional_contributions',
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CooperativeGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CooperativeMember" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "externalReference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CooperativeMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CooperativeContributionPlan" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "graceDays" INTEGER NOT NULL DEFAULT 0,
    "penaltyAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CooperativeContributionPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CooperativeContribution" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "planId" TEXT,
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "penaltyAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CooperativeContribution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CooperativeLoan" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "principal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "interestAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "penaltyAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalDue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "disbursedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "disbursedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CooperativeLoan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CooperativeLoanGuarantor" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CooperativeLoanGuarantor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CooperativeLoanRepayment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "principalPortion" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "interestPortion" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "penaltyPortion" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reference" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CooperativeLoanRepayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CooperativeMeeting" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "heldAt" TIMESTAMP(3),
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CooperativeMeeting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CooperativeResolution" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "meetingId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "votesFor" INTEGER NOT NULL DEFAULT 0,
    "votesAgainst" INTEGER NOT NULL DEFAULT 0,
    "passedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CooperativeResolution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CooperativeExpense" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "spentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CooperativeExpense_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CooperativeDistribution" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "memberId" TEXT,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "ruleVersion" TEXT NOT NULL,
    "basis" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CooperativeDistribution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CooperativeLedgerEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "memberId" TEXT,
    "contributionId" TEXT,
    "loanId" TEXT,
    "repaymentId" TEXT,
    "expenseId" TEXT,
    "distributionId" TEXT,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entryType" TEXT NOT NULL,
    "debit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "credit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "memo" TEXT,
    "reference" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CooperativeLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CooperativeGroup_businessId_name_key" ON "CooperativeGroup"("businessId", "name");
CREATE INDEX "CooperativeGroup_businessId_status_createdAt_idx" ON "CooperativeGroup"("businessId", "status", "createdAt");
CREATE INDEX "CooperativeGroup_businessId_locationId_status_idx" ON "CooperativeGroup"("businessId", "locationId", "status");

CREATE UNIQUE INDEX "CooperativeMember_groupId_externalReference_key" ON "CooperativeMember"("groupId", "externalReference");
CREATE INDEX "CooperativeMember_businessId_groupId_status_idx" ON "CooperativeMember"("businessId", "groupId", "status");
CREATE INDEX "CooperativeMember_groupId_displayName_idx" ON "CooperativeMember"("groupId", "displayName");
CREATE INDEX "CooperativeMember_groupId_phone_idx" ON "CooperativeMember"("groupId", "phone");

CREATE INDEX "CooperativeContributionPlan_businessId_groupId_status_idx" ON "CooperativeContributionPlan"("businessId", "groupId", "status");
CREATE INDEX "CooperativeContributionPlan_groupId_frequency_status_idx" ON "CooperativeContributionPlan"("groupId", "frequency", "status");

CREATE INDEX "CooperativeContribution_businessId_groupId_paidAt_idx" ON "CooperativeContribution"("businessId", "groupId", "paidAt");
CREATE INDEX "CooperativeContribution_groupId_memberId_paidAt_idx" ON "CooperativeContribution"("groupId", "memberId", "paidAt");
CREATE INDEX "CooperativeContribution_groupId_planId_paidAt_idx" ON "CooperativeContribution"("groupId", "planId", "paidAt");
CREATE INDEX "CooperativeContribution_businessId_reference_idx" ON "CooperativeContribution"("businessId", "reference");

CREATE INDEX "CooperativeLoan_businessId_groupId_status_idx" ON "CooperativeLoan"("businessId", "groupId", "status");
CREATE INDEX "CooperativeLoan_groupId_memberId_status_idx" ON "CooperativeLoan"("groupId", "memberId", "status");
CREATE INDEX "CooperativeLoan_groupId_dueAt_idx" ON "CooperativeLoan"("groupId", "dueAt");

CREATE UNIQUE INDEX "CooperativeLoanGuarantor_loanId_memberId_key" ON "CooperativeLoanGuarantor"("loanId", "memberId");
CREATE INDEX "CooperativeLoanGuarantor_businessId_groupId_status_idx" ON "CooperativeLoanGuarantor"("businessId", "groupId", "status");
CREATE INDEX "CooperativeLoanGuarantor_groupId_memberId_idx" ON "CooperativeLoanGuarantor"("groupId", "memberId");

CREATE INDEX "CooperativeLoanRepayment_businessId_groupId_paidAt_idx" ON "CooperativeLoanRepayment"("businessId", "groupId", "paidAt");
CREATE INDEX "CooperativeLoanRepayment_groupId_loanId_paidAt_idx" ON "CooperativeLoanRepayment"("groupId", "loanId", "paidAt");
CREATE INDEX "CooperativeLoanRepayment_groupId_memberId_paidAt_idx" ON "CooperativeLoanRepayment"("groupId", "memberId", "paidAt");

CREATE INDEX "CooperativeMeeting_businessId_groupId_scheduledAt_idx" ON "CooperativeMeeting"("businessId", "groupId", "scheduledAt");
CREATE INDEX "CooperativeMeeting_groupId_status_scheduledAt_idx" ON "CooperativeMeeting"("groupId", "status", "scheduledAt");

CREATE INDEX "CooperativeResolution_businessId_groupId_status_idx" ON "CooperativeResolution"("businessId", "groupId", "status");
CREATE INDEX "CooperativeResolution_groupId_meetingId_idx" ON "CooperativeResolution"("groupId", "meetingId");

CREATE INDEX "CooperativeExpense_businessId_groupId_spentAt_idx" ON "CooperativeExpense"("businessId", "groupId", "spentAt");
CREATE INDEX "CooperativeExpense_groupId_category_spentAt_idx" ON "CooperativeExpense"("groupId", "category", "spentAt");

CREATE INDEX "CooperativeDistribution_businessId_groupId_status_idx" ON "CooperativeDistribution"("businessId", "groupId", "status");
CREATE INDEX "CooperativeDistribution_groupId_memberId_calculatedAt_idx" ON "CooperativeDistribution"("groupId", "memberId", "calculatedAt");

CREATE INDEX "CooperativeLedgerEntry_businessId_groupId_entryDate_idx" ON "CooperativeLedgerEntry"("businessId", "groupId", "entryDate");
CREATE INDEX "CooperativeLedgerEntry_groupId_memberId_entryDate_idx" ON "CooperativeLedgerEntry"("groupId", "memberId", "entryDate");
CREATE INDEX "CooperativeLedgerEntry_groupId_entryType_entryDate_idx" ON "CooperativeLedgerEntry"("groupId", "entryType", "entryDate");
CREATE INDEX "CooperativeLedgerEntry_businessId_reference_idx" ON "CooperativeLedgerEntry"("businessId", "reference");

ALTER TABLE "CooperativeGroup" ADD CONSTRAINT "CooperativeGroup_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CooperativeGroup" ADD CONSTRAINT "CooperativeGroup_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CooperativeMember" ADD CONSTRAINT "CooperativeMember_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "CooperativeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CooperativeContributionPlan" ADD CONSTRAINT "CooperativeContributionPlan_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "CooperativeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CooperativeContribution" ADD CONSTRAINT "CooperativeContribution_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "CooperativeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CooperativeContribution" ADD CONSTRAINT "CooperativeContribution_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "CooperativeMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CooperativeContribution" ADD CONSTRAINT "CooperativeContribution_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "CooperativeContributionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CooperativeLoan" ADD CONSTRAINT "CooperativeLoan_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "CooperativeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CooperativeLoan" ADD CONSTRAINT "CooperativeLoan_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "CooperativeMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CooperativeLoanGuarantor" ADD CONSTRAINT "CooperativeLoanGuarantor_loanId_fkey"
  FOREIGN KEY ("loanId") REFERENCES "CooperativeLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CooperativeLoanGuarantor" ADD CONSTRAINT "CooperativeLoanGuarantor_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "CooperativeMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CooperativeLoanRepayment" ADD CONSTRAINT "CooperativeLoanRepayment_loanId_fkey"
  FOREIGN KEY ("loanId") REFERENCES "CooperativeLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CooperativeLoanRepayment" ADD CONSTRAINT "CooperativeLoanRepayment_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "CooperativeMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CooperativeMeeting" ADD CONSTRAINT "CooperativeMeeting_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "CooperativeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CooperativeResolution" ADD CONSTRAINT "CooperativeResolution_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "CooperativeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CooperativeResolution" ADD CONSTRAINT "CooperativeResolution_meetingId_fkey"
  FOREIGN KEY ("meetingId") REFERENCES "CooperativeMeeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CooperativeExpense" ADD CONSTRAINT "CooperativeExpense_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "CooperativeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CooperativeDistribution" ADD CONSTRAINT "CooperativeDistribution_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "CooperativeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CooperativeDistribution" ADD CONSTRAINT "CooperativeDistribution_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "CooperativeMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CooperativeLedgerEntry" ADD CONSTRAINT "CooperativeLedgerEntry_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "CooperativeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CooperativeLedgerEntry" ADD CONSTRAINT "CooperativeLedgerEntry_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "CooperativeMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CooperativeLedgerEntry" ADD CONSTRAINT "CooperativeLedgerEntry_contributionId_fkey"
  FOREIGN KEY ("contributionId") REFERENCES "CooperativeContribution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CooperativeLedgerEntry" ADD CONSTRAINT "CooperativeLedgerEntry_loanId_fkey"
  FOREIGN KEY ("loanId") REFERENCES "CooperativeLoan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CooperativeLedgerEntry" ADD CONSTRAINT "CooperativeLedgerEntry_repaymentId_fkey"
  FOREIGN KEY ("repaymentId") REFERENCES "CooperativeLoanRepayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CooperativeLedgerEntry" ADD CONSTRAINT "CooperativeLedgerEntry_expenseId_fkey"
  FOREIGN KEY ("expenseId") REFERENCES "CooperativeExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CooperativeLedgerEntry" ADD CONSTRAINT "CooperativeLedgerEntry_distributionId_fkey"
  FOREIGN KEY ("distributionId") REFERENCES "CooperativeDistribution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CooperativeContributionPlan" ADD CONSTRAINT "CooperativeContributionPlan_amount_check"
  CHECK ("amount" >= 0 AND "graceDays" >= 0 AND "penaltyAmount" >= 0);

ALTER TABLE "CooperativeContribution" ADD CONSTRAINT "CooperativeContribution_amount_check"
  CHECK ("amount" >= 0 AND "penaltyAmount" >= 0);

ALTER TABLE "CooperativeLoan" ADD CONSTRAINT "CooperativeLoan_amount_check"
  CHECK (
    "principal" >= 0
    AND "interestAmount" >= 0
    AND "penaltyAmount" >= 0
    AND "totalDue" >= 0
    AND "disbursedAmount" >= 0
  );

ALTER TABLE "CooperativeLoanRepayment" ADD CONSTRAINT "CooperativeLoanRepayment_amount_check"
  CHECK (
    "amount" >= 0
    AND "principalPortion" >= 0
    AND "interestPortion" >= 0
    AND "penaltyPortion" >= 0
    AND ("principalPortion" + "interestPortion" + "penaltyPortion") <= "amount"
  );

ALTER TABLE "CooperativeResolution" ADD CONSTRAINT "CooperativeResolution_votes_check"
  CHECK ("votesFor" >= 0 AND "votesAgainst" >= 0);

ALTER TABLE "CooperativeExpense" ADD CONSTRAINT "CooperativeExpense_amount_check"
  CHECK ("amount" >= 0);

ALTER TABLE "CooperativeDistribution" ADD CONSTRAINT "CooperativeDistribution_amount_check"
  CHECK ("amount" >= 0);

ALTER TABLE "CooperativeLedgerEntry" ADD CONSTRAINT "CooperativeLedgerEntry_debit_credit_check"
  CHECK (
    "debit" >= 0
    AND "credit" >= 0
    AND (
      ("debit" > 0 AND "credit" = 0)
      OR ("credit" > 0 AND "debit" = 0)
    )
  );
