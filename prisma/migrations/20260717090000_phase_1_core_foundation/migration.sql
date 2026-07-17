-- CreateEnum
CREATE TYPE "StockAdjustmentType" AS ENUM ('STOCK_IN', 'STOCK_OUT', 'DAMAGED', 'EXPIRED', 'LOST', 'THEFT', 'COUNT_CORRECTION', 'PERSONAL_USE', 'PROMOTIONAL_GIVEAWAY', 'SUPPLIER_RETURN', 'CUSTOMER_RETURN', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'POS_TERMINAL', 'CARD', 'WALLET', 'CREDIT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReturnDisposition" AS ENUM ('SELLABLE_STOCK', 'DAMAGED_STOCK', 'NO_STOCK');

-- CreateEnum
CREATE TYPE "CustomerReturnOutcome" AS ENUM ('CASH_REFUND', 'TRANSFER_REFUND', 'STORE_CREDIT', 'EXCHANGE', 'REDUCE_CUSTOMER_BALANCE');

-- CreateEnum
CREATE TYPE "SupplierReturnSettlement" AS ENUM ('SUPPLIER_CREDIT', 'REFUND_RECEIVED', 'REPLACEMENT_EXPECTED', 'REDUCE_SUPPLIER_BILL');

-- CreateEnum
CREATE TYPE "OfflineSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED', 'CONFLICT');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "businessCategory" TEXT;

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "baseUnitId" TEXT,
ADD COLUMN     "brandId" TEXT,
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "conversionFactor" DECIMAL(65,30),
ADD COLUMN     "internalCode" TEXT,
ADD COLUMN     "lowStockLevelDecimal" DECIMAL(65,30) NOT NULL DEFAULT 5,
ADD COLUMN     "quantityOnHandDecimal" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "sellingUnitId" TEXT,
ADD COLUMN     "unitId" TEXT;

UPDATE "InventoryItem"
SET
  "quantityOnHandDecimal" = "quantityOnHand",
  "lowStockLevelDecimal" = "lowStockLevel";

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "actorId" TEXT,
ADD COLUMN     "adjustmentType" "StockAdjustmentType",
ADD COLUMN     "afterQuantityDecimal" DECIMAL(65,30),
ADD COLUMN     "attachmentUrl" TEXT,
ADD COLUMN     "beforeQuantityDecimal" DECIMAL(65,30),
ADD COLUMN     "businessId" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "quantityDecimal" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "reason" TEXT;

UPDATE "InventoryMovement" movement
SET
  "quantityDecimal" = movement."quantity",
  "businessId" = item."businessId"
FROM "InventoryItem" item
WHERE item."id" = movement."itemId";

-- CreateTable
CREATE TABLE "ProductUnit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "singularLabel" TEXT NOT NULL,
    "pluralLabel" TEXT NOT NULL,
    "allowsDecimal" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "businessId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductBrand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductBrand_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ProductUnit" ("id", "name", "singularLabel", "pluralLabel", "allowsDecimal", "isDefault", "createdAt", "updatedAt")
VALUES
  ('default-unit-piece', 'piece', 'piece', 'pieces', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('default-unit-pack', 'pack', 'pack', 'packs', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('default-unit-carton', 'carton', 'carton', 'cartons', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('default-unit-bottle', 'bottle', 'bottle', 'bottles', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('default-unit-bag', 'bag', 'bag', 'bags', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('default-unit-dozen', 'dozen', 'dozen', 'dozen', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('default-unit-kilogram', 'kilogram', 'kilogram', 'kilograms', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('default-unit-gram', 'gram', 'gram', 'grams', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('default-unit-litre', 'litre', 'litre', 'litres', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('default-unit-millilitre', 'millilitre', 'millilitre', 'millilitres', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('default-unit-metre', 'metre', 'metre', 'metres', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('default-unit-roll', 'roll', 'roll', 'rolls', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('default-unit-crate', 'crate', 'crate', 'crates', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('default-unit-sachet', 'sachet', 'sachet', 'sachets', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('default-unit-bundle', 'bundle', 'bundle', 'bundles', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('default-unit-box', 'box', 'box', 'boxes', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- CreateTable
CREATE TABLE "TransactionPayment" (
    "id" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "note" TEXT,
    "idempotencyKey" TEXT,
    "businessId" TEXT NOT NULL,
    "accountId" TEXT,
    "transactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerReturn" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "disposition" "ReturnDisposition" NOT NULL,
    "outcome" "CustomerReturnOutcome" NOT NULL,
    "refundAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "note" TEXT,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT,
    "originalTransactionId" TEXT NOT NULL,
    "refundTransactionId" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerReturnItem" (
    "id" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "total" DECIMAL(65,30) NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "customerReturnId" TEXT NOT NULL,

    CONSTRAINT "CustomerReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierReturn" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "settlement" "SupplierReturnSettlement" NOT NULL,
    "settlementAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "note" TEXT,
    "businessId" TEXT NOT NULL,
    "supplierId" TEXT,
    "originalTransactionId" TEXT,
    "settlementTransactionId" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierReturnItem" (
    "id" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unitCost" DECIMAL(65,30) NOT NULL,
    "total" DECIMAL(65,30) NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "supplierReturnId" TEXT NOT NULL,

    CONSTRAINT "SupplierReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptConfig" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "logoUrl" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "taxId" TEXT,
    "footerMessage" TEXT,
    "includePoweredBy" BOOLEAN NOT NULL DEFAULT true,
    "defaultPaperSize" TEXT NOT NULL DEFAULT '80mm',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceiptConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT,
    "currentStep" TEXT NOT NULL DEFAULT 'welcome',
    "goal" TEXT,
    "data" JSONB,
    "skippedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "step" TEXT,
    "metadata" JSONB,
    "userId" TEXT NOT NULL,
    "businessId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineSyncOperation" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "operationType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OfflineSyncStatus" NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "lastError" TEXT,
    "businessId" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3),

    CONSTRAINT "OfflineSyncOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductUnit_businessId_archivedAt_idx" ON "ProductUnit"("businessId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductUnit_businessId_name_key" ON "ProductUnit"("businessId", "name");

-- CreateIndex
CREATE INDEX "ProductCategory_businessId_archivedAt_name_idx" ON "ProductCategory"("businessId", "archivedAt", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_businessId_name_key" ON "ProductCategory"("businessId", "name");

-- CreateIndex
CREATE INDEX "ProductBrand_businessId_archivedAt_name_idx" ON "ProductBrand"("businessId", "archivedAt", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ProductBrand_businessId_name_key" ON "ProductBrand"("businessId", "name");

-- CreateIndex
CREATE INDEX "TransactionPayment_businessId_createdAt_idx" ON "TransactionPayment"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "TransactionPayment_transactionId_idx" ON "TransactionPayment"("transactionId");

-- CreateIndex
CREATE INDEX "TransactionPayment_accountId_createdAt_idx" ON "TransactionPayment"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionPayment_businessId_idempotencyKey_key" ON "TransactionPayment"("businessId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "CustomerReturn_businessId_createdAt_idx" ON "CustomerReturn"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerReturn_originalTransactionId_idx" ON "CustomerReturn"("originalTransactionId");

-- CreateIndex
CREATE INDEX "CustomerReturn_customerId_createdAt_idx" ON "CustomerReturn"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerReturn_businessId_idempotencyKey_key" ON "CustomerReturn"("businessId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "CustomerReturnItem_inventoryItemId_idx" ON "CustomerReturnItem"("inventoryItemId");

-- CreateIndex
CREATE INDEX "CustomerReturnItem_customerReturnId_idx" ON "CustomerReturnItem"("customerReturnId");

-- CreateIndex
CREATE INDEX "SupplierReturn_businessId_createdAt_idx" ON "SupplierReturn"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "SupplierReturn_supplierId_createdAt_idx" ON "SupplierReturn"("supplierId", "createdAt");

-- CreateIndex
CREATE INDEX "SupplierReturn_originalTransactionId_idx" ON "SupplierReturn"("originalTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierReturn_businessId_idempotencyKey_key" ON "SupplierReturn"("businessId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "SupplierReturnItem_inventoryItemId_idx" ON "SupplierReturnItem"("inventoryItemId");

-- CreateIndex
CREATE INDEX "SupplierReturnItem_supplierReturnId_idx" ON "SupplierReturnItem"("supplierReturnId");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptConfig_businessId_key" ON "ReceiptConfig"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingProgress_userId_key" ON "OnboardingProgress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingProgress_businessId_key" ON "OnboardingProgress"("businessId");

-- CreateIndex
CREATE INDEX "OnboardingProgress_businessId_idx" ON "OnboardingProgress"("businessId");

-- CreateIndex
CREATE INDEX "OnboardingProgress_completedAt_idx" ON "OnboardingProgress"("completedAt");

-- CreateIndex
CREATE INDEX "OnboardingEvent_userId_createdAt_idx" ON "OnboardingEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "OnboardingEvent_businessId_createdAt_idx" ON "OnboardingEvent"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "OnboardingEvent_name_createdAt_idx" ON "OnboardingEvent"("name", "createdAt");

-- CreateIndex
CREATE INDEX "OfflineSyncOperation_businessId_status_createdAt_idx" ON "OfflineSyncOperation"("businessId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "OfflineSyncOperation_nextRetryAt_idx" ON "OfflineSyncOperation"("nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineSyncOperation_businessId_operationId_key" ON "OfflineSyncOperation"("businessId", "operationId");

-- CreateIndex
CREATE INDEX "InventoryItem_businessId_categoryId_idx" ON "InventoryItem"("businessId", "categoryId");

-- CreateIndex
CREATE INDEX "InventoryItem_businessId_brandId_idx" ON "InventoryItem"("businessId", "brandId");

-- CreateIndex
CREATE INDEX "InventoryItem_businessId_archivedAt_idx" ON "InventoryItem"("businessId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_businessId_barcode_key" ON "InventoryItem"("businessId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_businessId_internalCode_key" ON "InventoryItem"("businessId", "internalCode");

-- CreateIndex
CREATE INDEX "InventoryMovement_businessId_createdAt_idx" ON "InventoryMovement"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_businessId_adjustmentType_createdAt_idx" ON "InventoryMovement"("businessId", "adjustmentType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_businessId_idempotencyKey_key" ON "InventoryMovement"("businessId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "ProductUnit" ADD CONSTRAINT "ProductUnit_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBrand" ADD CONSTRAINT "ProductBrand_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "ProductUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_baseUnitId_fkey" FOREIGN KEY ("baseUnitId") REFERENCES "ProductUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_sellingUnitId_fkey" FOREIGN KEY ("sellingUnitId") REFERENCES "ProductUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "ProductBrand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionPayment" ADD CONSTRAINT "TransactionPayment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionPayment" ADD CONSTRAINT "TransactionPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionPayment" ADD CONSTRAINT "TransactionPayment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerReturn" ADD CONSTRAINT "CustomerReturn_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerReturn" ADD CONSTRAINT "CustomerReturn_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerReturn" ADD CONSTRAINT "CustomerReturn_originalTransactionId_fkey" FOREIGN KEY ("originalTransactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerReturn" ADD CONSTRAINT "CustomerReturn_refundTransactionId_fkey" FOREIGN KEY ("refundTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerReturnItem" ADD CONSTRAINT "CustomerReturnItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerReturnItem" ADD CONSTRAINT "CustomerReturnItem_customerReturnId_fkey" FOREIGN KEY ("customerReturnId") REFERENCES "CustomerReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_originalTransactionId_fkey" FOREIGN KEY ("originalTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_settlementTransactionId_fkey" FOREIGN KEY ("settlementTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "SupplierReturnItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "SupplierReturnItem_supplierReturnId_fkey" FOREIGN KEY ("supplierReturnId") REFERENCES "SupplierReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptConfig" ADD CONSTRAINT "ReceiptConfig_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingEvent" ADD CONSTRAINT "OnboardingEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingEvent" ADD CONSTRAINT "OnboardingEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineSyncOperation" ADD CONSTRAINT "OfflineSyncOperation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineSyncOperation" ADD CONSTRAINT "OfflineSyncOperation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
