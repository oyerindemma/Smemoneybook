-- CreateEnum
CREATE TYPE "BusinessLocationType" AS ENUM ('MAIN_SHOP', 'WAREHOUSE', 'BRANCH', 'STORAGE', 'VIRTUAL', 'DAMAGED_GOODS', 'TRANSIT');

-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('DRAFT', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'PARTIALLY_RECEIVED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "locationId" TEXT;

-- AlterTable
ALTER TABLE "TransactionPayment" ADD COLUMN "locationId" TEXT;

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN "locationId" TEXT,
ADD COLUMN "sourceLocationId" TEXT,
ADD COLUMN "destinationLocationId" TEXT;

-- AlterTable
ALTER TABLE "CustomerReturn" ADD COLUMN "locationId" TEXT;

-- AlterTable
ALTER TABLE "SupplierReturn" ADD COLUMN "locationId" TEXT;

-- AlterTable
ALTER TABLE "ReportSnapshot" ADD COLUMN "locationId" TEXT;

-- AlterTable
ALTER TABLE "ReceiptConfig" ADD COLUMN "locationId" TEXT;

-- CreateTable
CREATE TABLE "BusinessLocation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "BusinessLocationType" NOT NULL DEFAULT 'MAIN_SHOP',
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessLocationMember" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessLocationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" TEXT NOT NULL,
    "quantityOnHandDecimal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lowStockLevelDecimal" DECIMAL(65,30) NOT NULL DEFAULT 5,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransfer" (
    "id" TEXT NOT NULL,
    "transferNumber" TEXT NOT NULL,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "reference" TEXT,
    "idempotencyKey" TEXT,
    "businessId" TEXT NOT NULL,
    "sourceLocationId" TEXT NOT NULL,
    "destinationLocationId" TEXT NOT NULL,
    "createdById" TEXT,
    "approvedById" TEXT,
    "sentById" TEXT,
    "receivedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransferItem" (
    "id" TEXT NOT NULL,
    "requestedQuantity" DECIMAL(65,30) NOT NULL,
    "sentQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "receivedQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "damagedQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "shortageQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "note" TEXT,
    "transferId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,

    CONSTRAINT "StockTransferItem_pkey" PRIMARY KEY ("id")
);

-- Backfill default locations for all existing businesses.
INSERT INTO "BusinessLocation" ("id", "name", "type", "isDefault", "businessId", "createdAt", "updatedAt")
SELECT CONCAT('default-location-', b."id"), 'Main shop', 'MAIN_SHOP', true, b."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Business" b;

-- Preserve current business access by assigning every existing member to the default location.
INSERT INTO "BusinessLocationMember" ("id", "role", "userId", "businessId", "locationId", "createdAt")
SELECT
  CONCAT('default-location-member-', bm."id"),
  bm."role",
  bm."userId",
  bm."businessId",
  bl."id",
  CURRENT_TIMESTAMP
FROM "BusinessMember" bm
INNER JOIN "BusinessLocation" bl ON bl."businessId" = bm."businessId" AND bl."isDefault" = true;

-- Preserve existing aggregate stock as default-location balances.
INSERT INTO "InventoryBalance" ("id", "quantityOnHandDecimal", "lowStockLevelDecimal", "businessId", "locationId", "inventoryItemId", "createdAt", "updatedAt")
SELECT
  CONCAT('default-balance-', item."id"),
  item."quantityOnHandDecimal",
  item."lowStockLevelDecimal",
  item."businessId",
  bl."id",
  item."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "InventoryItem" item
INNER JOIN "BusinessLocation" bl ON bl."businessId" = item."businessId" AND bl."isDefault" = true;

-- Backfill existing history to the default location to preserve historical meaning.
UPDATE "Transaction" t
SET "locationId" = bl."id"
FROM "BusinessLocation" bl
WHERE bl."businessId" = t."businessId" AND bl."isDefault" = true;

UPDATE "TransactionPayment" p
SET "locationId" = bl."id"
FROM "BusinessLocation" bl
WHERE bl."businessId" = p."businessId" AND bl."isDefault" = true;

UPDATE "InventoryMovement" m
SET "locationId" = bl."id"
FROM "BusinessLocation" bl
WHERE bl."businessId" = m."businessId" AND bl."isDefault" = true;

UPDATE "CustomerReturn" r
SET "locationId" = bl."id"
FROM "BusinessLocation" bl
WHERE bl."businessId" = r."businessId" AND bl."isDefault" = true;

UPDATE "SupplierReturn" r
SET "locationId" = bl."id"
FROM "BusinessLocation" bl
WHERE bl."businessId" = r."businessId" AND bl."isDefault" = true;

UPDATE "ReportSnapshot" r
SET "locationId" = bl."id"
FROM "BusinessLocation" bl
WHERE bl."businessId" = r."businessId" AND bl."isDefault" = true;

UPDATE "ReceiptConfig" c
SET "locationId" = bl."id"
FROM "BusinessLocation" bl
WHERE bl."businessId" = c."businessId" AND bl."isDefault" = true;

-- CreateIndex
CREATE UNIQUE INDEX "BusinessLocation_businessId_name_key" ON "BusinessLocation"("businessId", "name");
CREATE UNIQUE INDEX "BusinessLocation_one_default_per_business" ON "BusinessLocation"("businessId") WHERE "isDefault" = true AND "archivedAt" IS NULL;
CREATE INDEX "BusinessLocation_businessId_isDefault_idx" ON "BusinessLocation"("businessId", "isDefault");
CREATE INDEX "BusinessLocation_businessId_archivedAt_idx" ON "BusinessLocation"("businessId", "archivedAt");
CREATE INDEX "BusinessLocation_type_idx" ON "BusinessLocation"("type");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessLocationMember_locationId_userId_key" ON "BusinessLocationMember"("locationId", "userId");
CREATE INDEX "BusinessLocationMember_businessId_userId_idx" ON "BusinessLocationMember"("businessId", "userId");
CREATE INDEX "BusinessLocationMember_businessId_locationId_idx" ON "BusinessLocationMember"("businessId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_businessId_locationId_inventoryItemId_key" ON "InventoryBalance"("businessId", "locationId", "inventoryItemId");
CREATE INDEX "InventoryBalance_businessId_locationId_idx" ON "InventoryBalance"("businessId", "locationId");
CREATE INDEX "InventoryBalance_inventoryItemId_idx" ON "InventoryBalance"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_businessId_transferNumber_key" ON "StockTransfer"("businessId", "transferNumber");
CREATE UNIQUE INDEX "StockTransfer_businessId_idempotencyKey_key" ON "StockTransfer"("businessId", "idempotencyKey");
CREATE INDEX "StockTransfer_businessId_status_createdAt_idx" ON "StockTransfer"("businessId", "status", "createdAt");
CREATE INDEX "StockTransfer_businessId_sourceLocationId_createdAt_idx" ON "StockTransfer"("businessId", "sourceLocationId", "createdAt");
CREATE INDEX "StockTransfer_businessId_destinationLocationId_createdAt_idx" ON "StockTransfer"("businessId", "destinationLocationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransferItem_transferId_inventoryItemId_key" ON "StockTransferItem"("transferId", "inventoryItemId");
CREATE INDEX "StockTransferItem_inventoryItemId_idx" ON "StockTransferItem"("inventoryItemId");

-- CreateIndex
CREATE INDEX "Transaction_businessId_locationId_occurredAt_idx" ON "Transaction"("businessId", "locationId", "occurredAt");
CREATE INDEX "TransactionPayment_businessId_locationId_createdAt_idx" ON "TransactionPayment"("businessId", "locationId", "createdAt");
CREATE INDEX "InventoryMovement_businessId_locationId_createdAt_idx" ON "InventoryMovement"("businessId", "locationId", "createdAt");
CREATE INDEX "InventoryMovement_businessId_sourceLocationId_createdAt_idx" ON "InventoryMovement"("businessId", "sourceLocationId", "createdAt");
CREATE INDEX "InventoryMovement_businessId_destinationLocationId_createdAt_idx" ON "InventoryMovement"("businessId", "destinationLocationId", "createdAt");
CREATE INDEX "CustomerReturn_businessId_locationId_createdAt_idx" ON "CustomerReturn"("businessId", "locationId", "createdAt");
CREATE INDEX "SupplierReturn_businessId_locationId_createdAt_idx" ON "SupplierReturn"("businessId", "locationId", "createdAt");
CREATE INDEX "ReportSnapshot_businessId_locationId_periodStart_periodEnd_idx" ON "ReportSnapshot"("businessId", "locationId", "periodStart", "periodEnd");
CREATE INDEX "ReceiptConfig_locationId_idx" ON "ReceiptConfig"("locationId");

-- AddForeignKey
ALTER TABLE "BusinessLocation" ADD CONSTRAINT "BusinessLocation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessLocationMember" ADD CONSTRAINT "BusinessLocationMember_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessLocationMember" ADD CONSTRAINT "BusinessLocationMember_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessLocationMember" ADD CONSTRAINT "BusinessLocationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TransactionPayment" ADD CONSTRAINT "TransactionPayment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerReturn" ADD CONSTRAINT "CustomerReturn_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReceiptConfig" ADD CONSTRAINT "ReceiptConfig_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "BusinessLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "BusinessLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
