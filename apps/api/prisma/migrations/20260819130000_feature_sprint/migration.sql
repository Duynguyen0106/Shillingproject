-- ProofJobStatus enum
CREATE TYPE "ProofJobStatus" AS ENUM ('PENDING', 'CHECKING', 'SCORED', 'FAILED');

-- ProofJob
CREATE TABLE "ProofJob" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "feedPostId" TEXT NOT NULL,
  "status" "ProofJobStatus" NOT NULL DEFAULT 'PENDING',
  "proofUrl" TEXT,
  "pointsAwarded" INTEGER,
  "failReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProofJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProofJob_userId_communityId_idx" ON "ProofJob"("userId", "communityId");
CREATE INDEX "ProofJob_feedPostId_idx" ON "ProofJob"("feedPostId");
ALTER TABLE "ProofJob" ADD CONSTRAINT "ProofJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProofJob" ADD CONSTRAINT "ProofJob_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProofJob" ADD CONSTRAINT "ProofJob_feedPostId_fkey" FOREIGN KEY ("feedPostId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- UserStreak
CREATE TABLE "UserStreak" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "currentStreak" INTEGER NOT NULL DEFAULT 0,
  "longestStreak" INTEGER NOT NULL DEFAULT 0,
  "lastActivityDate" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserStreak_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserStreak_userId_key" ON "UserStreak"("userId");
ALTER TABLE "UserStreak" ADD CONSTRAINT "UserStreak_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Achievement
CREATE TABLE "Achievement" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "icon" TEXT,
  CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Achievement_slug_key" ON "Achievement"("slug");

-- UserAchievement
CREATE TABLE "UserAchievement" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "achievementId" TEXT NOT NULL,
  "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserAchievement_userId_achievementId_key" ON "UserAchievement"("userId", "achievementId");
CREATE INDEX "UserAchievement_userId_idx" ON "UserAchievement"("userId");
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Announcement
CREATE TABLE "Announcement" (
  "id" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "authorId" TEXT,
  "text" TEXT NOT NULL,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Announcement_communityId_createdAt_idx" ON "Announcement"("communityId", "createdAt");
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PushSubscription
CREATE TABLE "PushSubscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PushSubscription_userId_endpoint_key" ON "PushSubscription"("userId", "endpoint");
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Redemption
CREATE TABLE "Redemption" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "pointsBurned" INTEGER NOT NULL,
  "txHash" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Redemption_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Redemption_userId_communityId_idx" ON "Redemption"("userId", "communityId");
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
