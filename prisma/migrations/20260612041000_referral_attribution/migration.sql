-- CreateTable
CREATE TABLE "ReferralAttribution" (
    "id" TEXT NOT NULL,
    "referralCode" TEXT NOT NULL,
    "referrerBusinessId" TEXT,
    "referredUserId" TEXT NOT NULL,
    "referredBusinessId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'signup',
    "status" TEXT NOT NULL DEFAULT 'SIGNED_UP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralReward" (
    "id" TEXT NOT NULL,
    "attributionId" TEXT,
    "beneficiaryUserId" TEXT,
    "beneficiaryBusinessId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "description" TEXT NOT NULL,
    "value" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedAt" TIMESTAMP(3),

    CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferralAttribution_referredUserId_key" ON "ReferralAttribution"("referredUserId");

-- CreateIndex
CREATE INDEX "ReferralAttribution_referralCode_createdAt_idx" ON "ReferralAttribution"("referralCode", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralAttribution_referrerBusinessId_createdAt_idx" ON "ReferralAttribution"("referrerBusinessId", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralAttribution_referredBusinessId_idx" ON "ReferralAttribution"("referredBusinessId");

-- CreateIndex
CREATE INDEX "ReferralReward_beneficiaryUserId_status_idx" ON "ReferralReward"("beneficiaryUserId", "status");

-- CreateIndex
CREATE INDEX "ReferralReward_beneficiaryBusinessId_status_idx" ON "ReferralReward"("beneficiaryBusinessId", "status");

-- CreateIndex
CREATE INDEX "ReferralReward_type_createdAt_idx" ON "ReferralReward"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_referrerBusinessId_fkey" FOREIGN KEY ("referrerBusinessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_referredBusinessId_fkey" FOREIGN KEY ("referredBusinessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_attributionId_fkey" FOREIGN KEY ("attributionId") REFERENCES "ReferralAttribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_beneficiaryUserId_fkey" FOREIGN KEY ("beneficiaryUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_beneficiaryBusinessId_fkey" FOREIGN KEY ("beneficiaryBusinessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
