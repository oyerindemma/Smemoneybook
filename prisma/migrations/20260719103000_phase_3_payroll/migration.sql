-- Phase 3J payroll foundation.
-- Additive only: payroll runs snapshot calculated pay and do not create business transactions automatically.
CREATE TABLE "PayrollEmployee" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT,
    "userId" TEXT,
    "employeeCode" TEXT,
    "displayName" TEXT NOT NULL,
    "roleTitle" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "baseSalary" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "payFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "country" TEXT NOT NULL DEFAULT 'NG',
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "pensionNumber" TEXT,
    "taxId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollEmployee_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "payDate" TIMESTAMP(3) NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'NG',
    "ruleVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "grossPay" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netPay" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "employeeCount" INTEGER NOT NULL DEFAULT 0,
    "sourceInputs" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayrollRunItem" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "basePay" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "allowances" JSONB NOT NULL,
    "bonuses" JSONB NOT NULL,
    "deductions" JSONB NOT NULL,
    "loansAndAdvances" JSONB NOT NULL,
    "grossPay" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pensionEmployeeAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pensionEmployerAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netPay" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "payslipAccessHash" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRunItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayrollJournalEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "itemId" TEXT,
    "transactionId" TEXT,
    "entryType" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollJournalEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PayrollEmployee_businessId_employeeCode_key" ON "PayrollEmployee"("businessId", "employeeCode");
CREATE INDEX "PayrollEmployee_businessId_status_idx" ON "PayrollEmployee"("businessId", "status");
CREATE INDEX "PayrollEmployee_businessId_locationId_status_idx" ON "PayrollEmployee"("businessId", "locationId", "status");
CREATE INDEX "PayrollEmployee_businessId_displayName_idx" ON "PayrollEmployee"("businessId", "displayName");

CREATE INDEX "PayrollRun_businessId_status_periodStart_idx" ON "PayrollRun"("businessId", "status", "periodStart");
CREATE INDEX "PayrollRun_businessId_locationId_periodStart_idx" ON "PayrollRun"("businessId", "locationId", "periodStart");
CREATE INDEX "PayrollRun_businessId_lockedAt_idx" ON "PayrollRun"("businessId", "lockedAt");
CREATE UNIQUE INDEX "PayrollRun_businessId_locationId_periodStart_periodEnd_active_key"
  ON "PayrollRun"("businessId", COALESCE("locationId", ''), "periodStart", "periodEnd")
  WHERE "status" <> 'REVERSED';

CREATE INDEX "PayrollRunItem_businessId_runId_idx" ON "PayrollRunItem"("businessId", "runId");
CREATE INDEX "PayrollRunItem_businessId_employeeId_idx" ON "PayrollRunItem"("businessId", "employeeId");
CREATE INDEX "PayrollRunItem_runId_paymentStatus_idx" ON "PayrollRunItem"("runId", "paymentStatus");

CREATE INDEX "PayrollJournalEntry_businessId_runId_status_idx" ON "PayrollJournalEntry"("businessId", "runId", "status");
CREATE INDEX "PayrollJournalEntry_businessId_transactionId_idx" ON "PayrollJournalEntry"("businessId", "transactionId");
CREATE INDEX "PayrollJournalEntry_runId_entryType_idx" ON "PayrollJournalEntry"("runId", "entryType");

ALTER TABLE "PayrollEmployee" ADD CONSTRAINT "PayrollEmployee_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayrollEmployee" ADD CONSTRAINT "PayrollEmployee_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PayrollRunItem" ADD CONSTRAINT "PayrollRunItem_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayrollRunItem" ADD CONSTRAINT "PayrollRunItem_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "PayrollEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PayrollJournalEntry" ADD CONSTRAINT "PayrollJournalEntry_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayrollJournalEntry" ADD CONSTRAINT "PayrollJournalEntry_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "PayrollRunItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PayrollEmployee" ADD CONSTRAINT "PayrollEmployee_baseSalary_check"
  CHECK ("baseSalary" >= 0);

ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_totals_check"
  CHECK (
    "grossPay" >= 0
    AND "totalDeductions" >= 0
    AND "netPay" >= 0
    AND "employeeCount" >= 0
    AND "periodEnd" > "periodStart"
  );

ALTER TABLE "PayrollRunItem" ADD CONSTRAINT "PayrollRunItem_totals_check"
  CHECK (
    "basePay" >= 0
    AND "grossPay" >= 0
    AND "pensionEmployeeAmount" >= 0
    AND "pensionEmployerAmount" >= 0
    AND "taxAmount" >= 0
    AND "netPay" >= 0
  );

ALTER TABLE "PayrollJournalEntry" ADD CONSTRAINT "PayrollJournalEntry_amount_check"
  CHECK ("amount" >= 0);
