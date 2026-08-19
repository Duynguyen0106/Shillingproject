-- CreateEnum
CREATE TYPE "FeedPostKind" AS ENUM ('KOL_POST', 'MENTION');

-- CreateTable
CREATE TABLE "KolWatch" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT,
    "xUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastFetchedAt" TIMESTAMP(3),

    CONSTRAINT "KolWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedPost" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "kolWatchId" TEXT,
    "kind" "FeedPostKind" NOT NULL,
    "url" TEXT NOT NULL,
    "authorHandle" TEXT NOT NULL,
    "authorName" TEXT,
    "text" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "missionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KolWatch_communityId_handle_key" ON "KolWatch"("communityId", "handle");

-- CreateIndex
CREATE UNIQUE INDEX "FeedPost_communityId_url_key" ON "FeedPost"("communityId", "url");

-- CreateIndex
CREATE INDEX "FeedPost_communityId_postedAt_idx" ON "FeedPost"("communityId", "postedAt");

-- AddForeignKey
ALTER TABLE "KolWatch" ADD CONSTRAINT "KolWatch_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPost" ADD CONSTRAINT "FeedPost_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPost" ADD CONSTRAINT "FeedPost_kolWatchId_fkey" FOREIGN KEY ("kolWatchId") REFERENCES "KolWatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPost" ADD CONSTRAINT "FeedPost_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
