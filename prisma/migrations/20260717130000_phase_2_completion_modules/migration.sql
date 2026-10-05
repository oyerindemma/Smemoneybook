-- CreateEnum
CREATE TYPE "ExportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TaxRateType" AS ENUM ('VAT', 'ZERO_RATED', 'EXEMPT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "IssuedDocumentType" AS ENUM ('INVOICE', 'RECEIPT', 'QUOTE', 'STATEMENT');

-- CreateEnum
CREATE TYPE "IssuedDocumentStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE "Business" ADD COLUMN "defaultLanguage" TEXT NOT NULL DEFAULT 'en';

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "ExportJobStatus" NOT NULL DEFAULT 'PENDING',
    "format" TEXT NOT NULL DEFAULT 'csv',
    "payload" JSONB NOT NULL,
    "fileKey" TEXT,
    "downloadUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "error" TEXT,
    "businessId" TEXT NOT NULL,
    "actorId" TEXT,
    "locationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxConfig" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT,
    "country" TEXT NOT NULL DEFAULT 'NG',
    "registrationNumber" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "inclusiveByDefault" BOOLEAN NOT NULL DEFAULT false,
    "disclaimer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRate" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "type" "TaxRateType" NOT NULL DEFAULT 'VAT',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "businessId" TEXT NOT NULL,
    "locationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentBrandingConfig" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT,
    "tradingName" TEXT,
    "logoUrl" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "taxId" TEXT,
    "registrationNumber" TEXT,
    "bankDetails" TEXT,
    "paymentInstructions" TEXT,
    "footer" TEXT,
    "terms" TEXT,
    "accentColor" TEXT NOT NULL DEFAULT '#0B1F3A',
    "invoicePrefix" TEXT NOT NULL DEFAULT 'INV',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentBrandingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssuedDocument" (
    "id" TEXT NOT NULL,
    "type" "IssuedDocumentType" NOT NULL,
    "status" "IssuedDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "documentNumber" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "subtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "balanceDue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "lines" JSONB NOT NULL DEFAULT '[]',
    "brandSnapshot" JSONB,
    "taxSnapshot" JSONB,
    "metadata" JSONB,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT,
    "customerId" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IssuedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTaxSnapshot" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "inclusive" BOOLEAN NOT NULL DEFAULT false,
    "businessId" TEXT NOT NULL,
    "issuedDocumentId" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentTaxSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionPolicy" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "permissions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionOverride" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locationId" TEXT,
    "permissions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'all',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
    "publishAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementRead" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExportJob_businessId_status_createdAt_idx" ON "ExportJob"("businessId", "status", "createdAt");
CREATE INDEX "ExportJob_actorId_createdAt_idx" ON "ExportJob"("actorId", "createdAt");
CREATE INDEX "ExportJob_locationId_createdAt_idx" ON "ExportJob"("locationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaxConfig_businessId_key" ON "TaxConfig"("businessId");
CREATE INDEX "TaxConfig_locationId_idx" ON "TaxConfig"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRate_businessId_label_key" ON "TaxRate"("businessId", "label");
CREATE INDEX "TaxRate_businessId_archivedAt_idx" ON "TaxRate"("businessId", "archivedAt");
CREATE INDEX "TaxRate_locationId_idx" ON "TaxRate"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentBrandingConfig_businessId_key" ON "DocumentBrandingConfig"("businessId");
CREATE INDEX "DocumentBrandingConfig_locationId_idx" ON "DocumentBrandingConfig"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "IssuedDocument_businessId_documentNumber_key" ON "IssuedDocument"("businessId", "documentNumber");
CREATE INDEX "IssuedDocument_businessId_type_createdAt_idx" ON "IssuedDocument"("businessId", "type", "createdAt");
CREATE INDEX "IssuedDocument_locationId_createdAt_idx" ON "IssuedDocument"("locationId", "createdAt");
CREATE INDEX "IssuedDocument_customerId_createdAt_idx" ON "IssuedDocument"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentTaxSnapshot_businessId_createdAt_idx" ON "DocumentTaxSnapshot"("businessId", "createdAt");
CREATE INDEX "DocumentTaxSnapshot_issuedDocumentId_idx" ON "DocumentTaxSnapshot"("issuedDocumentId");
CREATE INDEX "DocumentTaxSnapshot_transactionId_idx" ON "DocumentTaxSnapshot"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionPolicy_businessId_role_key" ON "PermissionPolicy"("businessId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionOverride_businessId_userId_locationId_key" ON "PermissionOverride"("businessId", "userId", "locationId");
CREATE INDEX "PermissionOverride_userId_idx" ON "PermissionOverride"("userId");
CREATE INDEX "PermissionOverride_locationId_idx" ON "PermissionOverride"("locationId");

-- CreateIndex
CREATE INDEX "Announcement_status_publishAt_idx" ON "Announcement"("status", "publishAt");
CREATE INDEX "Announcement_expiresAt_idx" ON "Announcement"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementRead_announcementId_userId_key" ON "AnnouncementRead"("announcementId", "userId");
CREATE INDEX "AnnouncementRead_userId_dismissedAt_idx" ON "AnnouncementRead"("userId", "dismissedAt");

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxConfig" ADD CONSTRAINT "TaxConfig_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaxConfig" ADD CONSTRAINT "TaxConfig_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentBrandingConfig" ADD CONSTRAINT "DocumentBrandingConfig_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentBrandingConfig" ADD CONSTRAINT "DocumentBrandingConfig_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedDocument" ADD CONSTRAINT "IssuedDocument_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IssuedDocument" ADD CONSTRAINT "IssuedDocument_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IssuedDocument" ADD CONSTRAINT "IssuedDocument_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IssuedDocument" ADD CONSTRAINT "IssuedDocument_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTaxSnapshot" ADD CONSTRAINT "DocumentTaxSnapshot_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentTaxSnapshot" ADD CONSTRAINT "DocumentTaxSnapshot_issuedDocumentId_fkey" FOREIGN KEY ("issuedDocumentId") REFERENCES "IssuedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentTaxSnapshot" ADD CONSTRAINT "DocumentTaxSnapshot_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionPolicy" ADD CONSTRAINT "PermissionPolicy_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionOverride" ADD CONSTRAINT "PermissionOverride_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PermissionOverride" ADD CONSTRAINT "PermissionOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PermissionOverride" ADD CONSTRAINT "PermissionOverride_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Normalize the long destination-location movement index name after PostgreSQL truncation.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'InventoryMovement_businessId_destinationLocationId_createdAt_id'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'InventoryMovement_businessId_destinationLocationId_createdA_idx'
  ) THEN
    ALTER INDEX "InventoryMovement_businessId_destinationLocationId_createdAt_id"
      RENAME TO "InventoryMovement_businessId_destinationLocationId_createdA_idx";
  END IF;
END $$;
