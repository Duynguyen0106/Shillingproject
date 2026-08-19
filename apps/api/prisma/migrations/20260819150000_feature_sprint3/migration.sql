-- Season
CREATE TABLE "Season" (
    "id" TEXT NOT NULL, "communityId" TEXT NOT NULL, "label" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Season_communityId_status_idx" ON "Season"("communityId", "status");
ALTER TABLE "Season" ADD CONSTRAINT "Season_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SeasonSnapshot
CREATE TABLE "SeasonSnapshot" (
    "id" TEXT NOT NULL, "seasonId" TEXT NOT NULL, "userId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL, "points" INTEGER NOT NULL, "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SeasonSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SeasonSnapshot_seasonId_userId_key" ON "SeasonSnapshot"("seasonId", "userId");
CREATE INDEX "SeasonSnapshot_seasonId_rank_idx" ON "SeasonSnapshot"("seasonId", "rank");
ALTER TABLE "SeasonSnapshot" ADD CONSTRAINT "SeasonSnapshot_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeasonSnapshot" ADD CONSTRAINT "SeasonSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeasonSnapshot" ADD CONSTRAINT "SeasonSnapshot_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DailyQuest
CREATE TABLE "DailyQuest" (
    "id" TEXT NOT NULL, "communityId" TEXT NOT NULL, "date" TEXT NOT NULL,
    "questType" TEXT NOT NULL, "description" TEXT NOT NULL,
    "pointBonus" INTEGER NOT NULL DEFAULT 25,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyQuest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DailyQuest_communityId_date_key" ON "DailyQuest"("communityId", "date");
CREATE INDEX "DailyQuest_communityId_date_idx" ON "DailyQuest"("communityId", "date");
ALTER TABLE "DailyQuest" ADD CONSTRAINT "DailyQuest_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DailyQuestCompletion
CREATE TABLE "DailyQuestCompletion" (
    "id" TEXT NOT NULL, "questId" TEXT NOT NULL, "userId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyQuestCompletion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DailyQuestCompletion_questId_userId_key" ON "DailyQuestCompletion"("questId", "userId");
CREATE INDEX "DailyQuestCompletion_userId_idx" ON "DailyQuestCompletion"("userId");
ALTER TABLE "DailyQuestCompletion" ADD CONSTRAINT "DailyQuestCompletion_questId_fkey" FOREIGN KEY ("questId") REFERENCES "DailyQuest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyQuestCompletion" ADD CONSTRAINT "DailyQuestCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RedemptionClaim
CREATE TABLE "RedemptionClaim" (
    "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "communityId" TEXT NOT NULL,
    "pointsBurned" INTEGER NOT NULL, "amount" TEXT NOT NULL,
    "signature" TEXT NOT NULL, "nonce" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3), "txHash" TEXT, "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RedemptionClaim_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RedemptionClaim_nonce_key" ON "RedemptionClaim"("nonce");
CREATE INDEX "RedemptionClaim_userId_communityId_idx" ON "RedemptionClaim"("userId", "communityId");
CREATE INDEX "RedemptionClaim_nonce_idx" ON "RedemptionClaim"("nonce");
ALTER TABLE "RedemptionClaim" ADD CONSTRAINT "RedemptionClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RedemptionClaim" ADD CONSTRAINT "RedemptionClaim_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
