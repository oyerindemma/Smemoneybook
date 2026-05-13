-- Add indexes for high-traffic business-scoped reads and queue-style polling.
CREATE INDEX "BusinessMember_businessId_idx" ON "BusinessMember"("businessId");

CREATE INDEX "Account_businessId_createdAt_idx" ON "Account"("businessId", "createdAt");

CREATE INDEX "Customer_businessId_createdAt_idx" ON "Customer"("businessId", "createdAt");
CREATE INDEX "Customer_businessId_name_idx" ON "Customer"("businessId", "name");

CREATE INDEX "Supplier_businessId_createdAt_idx" ON "Supplier"("businessId", "createdAt");
CREATE INDEX "Supplier_businessId_name_idx" ON "Supplier"("businessId", "name");

CREATE INDEX "Debt_businessId_status_createdAt_idx" ON "Debt"("businessId", "status", "createdAt");
CREATE INDEX "Debt_customerId_status_idx" ON "Debt"("customerId", "status");
CREATE INDEX "Debt_supplierId_status_idx" ON "Debt"("supplierId", "status");

CREATE INDEX "InventoryItem_businessId_updatedAt_idx" ON "InventoryItem"("businessId", "updatedAt");
CREATE INDEX "InventoryItem_businessId_createdAt_idx" ON "InventoryItem"("businessId", "createdAt");

CREATE INDEX "InventoryMovement_itemId_createdAt_idx" ON "InventoryMovement"("itemId", "createdAt");
CREATE INDEX "InventoryMovement_accountId_createdAt_idx" ON "InventoryMovement"("accountId", "createdAt");

CREATE INDEX "AssistantMessage_threadId_createdAt_idx" ON "AssistantMessage"("threadId", "createdAt");

CREATE INDEX "AutomationLog_businessId_type_createdAt_idx" ON "AutomationLog"("businessId", "type", "createdAt");

CREATE INDEX "PendingAssistantAction_businessId_status_createdAt_idx" ON "PendingAssistantAction"("businessId", "status", "createdAt");
