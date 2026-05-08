-- Paystack billing references and idempotent payment event storage
ALTER TABLE "Subscription" ADD COLUMN "amount" INTEGER;
ALTER TABLE "Subscription" ADD COLUMN "reference" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "paystackAccessCode" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "paystackCheckoutUrl" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "userId" TEXT;

CREATE UNIQUE INDEX "Subscription_reference_key" ON "Subscription"("reference");
CREATE INDEX "Subscription_userId_status_idx" ON "Subscription"("userId", "status");

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentEvent_reference_key" ON "PaymentEvent"("reference");
CREATE INDEX "PaymentEvent_eventType_processedAt_idx" ON "PaymentEvent"("eventType", "processedAt");
