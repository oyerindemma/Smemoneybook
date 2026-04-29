-- Phase 4 inventory-sales link: product sale metadata and movement history links.
ALTER TABLE "Transaction" ADD COLUMN "inventoryItemId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "inventoryQuantity" INTEGER;
ALTER TABLE "InventoryMovement" ADD COLUMN "transactionId" TEXT;

ALTER TABLE "Transaction"
ADD CONSTRAINT "Transaction_inventoryItemId_fkey"
FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement"
ADD CONSTRAINT "InventoryMovement_transactionId_fkey"
FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
