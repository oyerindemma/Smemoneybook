-- Phase 3I payroll completion.
-- Additive only: payroll stays owner-controlled, no automatic bank payment, no automatic statutory filing.

ALTER TABLE "PayrollEmployee"
  ADD COLUMN "staffMembershipId" TEXT,
  ADD COLUMN "employeeNumber" TEXT,
  ADD COLUMN "fullName" TEXT,
  ADD COLUMN "jobTitle" TEXT,
  ADD COLUMN "paymentMethod" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "maskedBankAccount" TEXT,
  ADD COLUMN "employmentStatus" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "startDate" TIMESTAMP(3),
  ADD COLUMN "endDate" TIMESTAMP(3);

UPDATE "PayrollEmployee"
SET
  "employeeNumber" = COALESCE("employeeCode", "id"),
  "fullName" = "displayName",
  "jobTitle" = "roleTitle",
  "employmentStatus" = LOWER("status"),
  "startDate" = "joinedAt",
  "endDate" = "exitedAt"
WHERE "employeeNumber" IS NULL;

ALTER TABLE "PayrollRun"
  ADD COLUMN "statutorySetupStatus" TEXT NOT NULL DEFAULT 'setup_required',
  ADD COLUMN "snapshotVersion" TEXT NOT NULL DEFAULT 'phase3i-payroll-snapshot-v1',
  ADD COLUMN "requiresDualApproval" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "preparedByUserId" TEXT,
  ADD COLUMN "submittedForReviewAt" TIMESTAMP(3),
  ADD COLUMN "reviewedByUserId" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedByUserId" TEXT,
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "expenseTransactionId" TEXT,
  ADD COLUMN "expensePostedAt" TIMESTAMP(3),
  ADD COLUMN "expensePostedByUserId" TEXT;

UPDATE "PayrollRun"
SET
  "preparedByUserId" = "createdById",
  "reviewedByUserId" = "approvedById",
  "reviewedAt" = "approvedAt"
WHERE "preparedByUserId" IS NULL;

ALTER TABLE "PayrollRunItem"
  ADD COLUMN "componentSnapshot" JSONB,
  ADD COLUMN "calculationVersion" TEXT NOT NULL DEFAULT 'phase3i-payroll-calculation-v1',
  ADD COLUMN "taxablePay" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "totalDeductions" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'draft';

UPDATE "PayrollRunItem"
SET
  "componentSnapshot" = jsonb_build_object(
    'allowances', "allowances",
    'bonuses', "bonuses",
    'deductions', "deductions",
    'loansAndAdvances', "loansAndAdvances",
    'pensionEmployeeAmount', "pensionEmployeeAmount",
    'pensionEmployerAmount', "pensionEmployerAmount",
    'taxAmount', "taxAmount"
  ),
  "taxablePay" = "grossPay",
  "totalDeductions" = "grossPay" - "netPay"
WHERE "componentSnapshot" IS NULL;

CREATE TABLE "PayrollCompensation" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "baseSalary" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "payFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollCompensation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayrollComponentDefinition" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "calculationMethod" TEXT NOT NULL,
  "taxable" BOOLEAN NOT NULL DEFAULT false,
  "pensionable" BOOLEAN NOT NULL DEFAULT false,
  "statutory" BOOLEAN NOT NULL DEFAULT false,
  "formulaConfig" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollComponentDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayrollEmployeeComponent" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "componentDefinitionId" TEXT NOT NULL,
  "amount" DECIMAL(65,30),
  "rate" DECIMAL(65,30),
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollEmployeeComponent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayrollPayslip" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "runItemId" TEXT NOT NULL,
  "storageReference" TEXT,
  "contentSnapshot" JSONB NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "generatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollPayslip_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayrollApprovalAction" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "periodId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "reason" TEXT,
  "performedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollApprovalAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PayrollEmployee_businessId_employeeNumber_key" ON "PayrollEmployee"("businessId", "employeeNumber");
CREATE INDEX "PayrollEmployee_businessId_employmentStatus_idx" ON "PayrollEmployee"("businessId", "employmentStatus");
CREATE INDEX "PayrollEmployee_businessId_staffMembershipId_idx" ON "PayrollEmployee"("businessId", "staffMembershipId");

CREATE INDEX "PayrollRun_businessId_expenseTransactionId_idx" ON "PayrollRun"("businessId", "expenseTransactionId");

CREATE INDEX "PayrollRunItem_runId_status_idx" ON "PayrollRunItem"("runId", "status");

CREATE INDEX "PayrollCompensation_businessId_employeeId_effectiveFrom_idx" ON "PayrollCompensation"("businessId", "employeeId", "effectiveFrom");
CREATE INDEX "PayrollCompensation_businessId_effectiveFrom_effectiveTo_idx" ON "PayrollCompensation"("businessId", "effectiveFrom", "effectiveTo");

CREATE UNIQUE INDEX "PayrollComponentDefinition_businessId_name_key" ON "PayrollComponentDefinition"("businessId", "name");
CREATE INDEX "PayrollComponentDefinition_businessId_type_active_idx" ON "PayrollComponentDefinition"("businessId", "type", "active");

CREATE INDEX "PayrollEmployeeComponent_businessId_employeeId_effectiveFrom_idx" ON "PayrollEmployeeComponent"("businessId", "employeeId", "effectiveFrom");
CREATE INDEX "PayrollEmployeeComponent_businessId_componentDefinitionId_idx" ON "PayrollEmployeeComponent"("businessId", "componentDefinitionId");

CREATE UNIQUE INDEX "PayrollPayslip_runItemId_key" ON "PayrollPayslip"("runItemId");
CREATE INDEX "PayrollPayslip_businessId_runId_idx" ON "PayrollPayslip"("businessId", "runId");
CREATE INDEX "PayrollPayslip_businessId_generatedAt_idx" ON "PayrollPayslip"("businessId", "generatedAt");

CREATE INDEX "PayrollApprovalAction_businessId_periodId_createdAt_idx" ON "PayrollApprovalAction"("businessId", "periodId", "createdAt");
CREATE INDEX "PayrollApprovalAction_businessId_action_createdAt_idx" ON "PayrollApprovalAction"("businessId", "action", "createdAt");

ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_expenseTransactionId_fkey"
  FOREIGN KEY ("expenseTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PayrollCompensation" ADD CONSTRAINT "PayrollCompensation_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayrollCompensation" ADD CONSTRAINT "PayrollCompensation_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "PayrollEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayrollComponentDefinition" ADD CONSTRAINT "PayrollComponentDefinition_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayrollEmployeeComponent" ADD CONSTRAINT "PayrollEmployeeComponent_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayrollEmployeeComponent" ADD CONSTRAINT "PayrollEmployeeComponent_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "PayrollEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayrollEmployeeComponent" ADD CONSTRAINT "PayrollEmployeeComponent_componentDefinitionId_fkey"
  FOREIGN KEY ("componentDefinitionId") REFERENCES "PayrollComponentDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PayrollPayslip" ADD CONSTRAINT "PayrollPayslip_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayrollPayslip" ADD CONSTRAINT "PayrollPayslip_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayrollPayslip" ADD CONSTRAINT "PayrollPayslip_runItemId_fkey"
  FOREIGN KEY ("runItemId") REFERENCES "PayrollRunItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayrollApprovalAction" ADD CONSTRAINT "PayrollApprovalAction_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayrollApprovalAction" ADD CONSTRAINT "PayrollApprovalAction_periodId_fkey"
  FOREIGN KEY ("periodId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayrollEmployee" ADD CONSTRAINT "PayrollEmployee_paymentMethod_check"
  CHECK ("paymentMethod" IN ('manual', 'cash', 'bank_transfer', 'cheque', 'mobile_money', 'other'));

ALTER TABLE "PayrollEmployee" ADD CONSTRAINT "PayrollEmployee_employmentStatus_check"
  CHECK ("employmentStatus" IN ('active', 'inactive', 'terminated', 'on_leave'));

ALTER TABLE "PayrollCompensation" ADD CONSTRAINT "PayrollCompensation_amounts_check"
  CHECK ("baseSalary" >= 0 AND ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"));

ALTER TABLE "PayrollComponentDefinition" ADD CONSTRAINT "PayrollComponentDefinition_type_check"
  CHECK ("type" IN ('allowance', 'deduction', 'employer_contribution'));

ALTER TABLE "PayrollComponentDefinition" ADD CONSTRAINT "PayrollComponentDefinition_calculationMethod_check"
  CHECK ("calculationMethod" IN ('fixed_amount', 'percentage_of_base', 'manual'));

ALTER TABLE "PayrollEmployeeComponent" ADD CONSTRAINT "PayrollEmployeeComponent_amount_rate_check"
  CHECK (
    ("amount" IS NULL OR "amount" >= 0)
    AND ("rate" IS NULL OR "rate" >= 0)
    AND ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom")
  );

ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_phase3i_status_check"
  CHECK ("status" IN ('DRAFT', 'CALCULATED', 'UNDER_REVIEW', 'APPROVED', 'EXPENSE_POSTED', 'CANCELLED', 'REVERSED', 'LOCKED'));

ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_statutorySetupStatus_check"
  CHECK ("statutorySetupStatus" IN ('setup_required', 'configured', 'not_applicable'));

ALTER TABLE "PayrollRunItem" ADD CONSTRAINT "PayrollRunItem_phase3i_totals_check"
  CHECK ("taxablePay" >= 0 AND "totalDeductions" >= 0);

ALTER TABLE "PayrollRunItem" ADD CONSTRAINT "PayrollRunItem_status_check"
  CHECK ("status" IN ('draft', 'calculated', 'approved', 'expense_posted', 'reversed'));

ALTER TABLE "PayrollApprovalAction" ADD CONSTRAINT "PayrollApprovalAction_action_check"
  CHECK ("action" IN ('prepared', 'submitted_for_review', 'reviewed', 'approved', 'rejected', 'expense_posted', 'reversed'));
