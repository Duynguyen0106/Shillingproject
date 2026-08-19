-- CreateTable
CREATE TABLE "FeedShill" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "feedPostId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "missionId" TEXT,
    "reshill" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedShill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedShill_communityId_createdAt_idx" ON "FeedShill"("communityId", "createdAt");

-- CreateIndex
CREATE INDEX "FeedShill_feedPostId_createdAt_idx" ON "FeedShill"("feedPostId", "createdAt");

-- CreateIndex
CREATE INDEX "FeedShill_userId_feedPostId_idx" ON "FeedShill"("userId", "feedPostId");

-- AddForeignKey
ALTER TABLE "FeedShill" ADD CONSTRAINT "FeedShill_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedShill" ADD CONSTRAINT "FeedShill_feedPostId_fkey" FOREIGN KEY ("feedPostId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedShill" ADD CONSTRAINT "FeedShill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
