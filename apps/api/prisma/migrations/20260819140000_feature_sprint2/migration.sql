-- AlterTable User
ALTER TABLE "User" ADD COLUMN "referralCode" TEXT;
ALTER TABLE "User" ADD COLUMN "holderMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0;

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateTable Referral
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "refereeId" TEXT NOT NULL,
    "communityId" TEXT,
    "code" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Referral_code_key" ON "Referral"("code");
CREATE UNIQUE INDEX "Referral_referrerId_refereeId_key" ON "Referral"("referrerId", "refereeId");
CREATE INDEX "Referral_referrerId_idx" ON "Referral"("referrerId");
CREATE INDEX "Referral_code_idx" ON "Referral"("code");
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_refereeId_fkey"  FOREIGN KEY ("refereeId")  REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable HolderTier
CREATE TABLE "HolderTier" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "minTokens" DOUBLE PRECISION NOT NULL,
    "multiplier" DOUBLE PRECISION NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HolderTier_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HolderTier_communityId_idx" ON "HolderTier"("communityId");
ALTER TABLE "HolderTier" ADD CONSTRAINT "HolderTier_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable AllianceRaid
CREATE TABLE "AllianceRaid" (
    "id" TEXT NOT NULL,
    "initiatorCommunityId" TEXT NOT NULL,
    "partnerCommunityId" TEXT NOT NULL,
    "feedPostId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AllianceRaid_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AllianceRaid_initiatorCommunityId_idx" ON "AllianceRaid"("initiatorCommunityId");
CREATE INDEX "AllianceRaid_partnerCommunityId_idx" ON "AllianceRaid"("partnerCommunityId");
ALTER TABLE "AllianceRaid" ADD CONSTRAINT "AllianceRaid_initiatorCommunityId_fkey" FOREIGN KEY ("initiatorCommunityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AllianceRaid" ADD CONSTRAINT "AllianceRaid_partnerCommunityId_fkey" FOREIGN KEY ("partnerCommunityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AllianceRaid" ADD CONSTRAINT "AllianceRaid_feedPostId_fkey" FOREIGN KEY ("feedPostId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
