ALTER TABLE "Business"
ADD COLUMN "businessType" TEXT,
ADD COLUMN "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false;
