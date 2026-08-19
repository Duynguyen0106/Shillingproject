-- AlterTable
ALTER TABLE "KolWatch" ADD COLUMN "bio" TEXT;
ALTER TABLE "KolWatch" ADD COLUMN "profileImageUrl" TEXT;
ALTER TABLE "KolWatch" ADD COLUMN "followers" INTEGER;
ALTER TABLE "KolWatch" ADD COLUMN "following" INTEGER;
ALTER TABLE "KolWatch" ADD COLUMN "statusesCount" INTEGER;
ALTER TABLE "KolWatch" ADD COLUMN "verified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "FeedPost" ADD COLUMN "authorFollowers" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FeedPost" ADD COLUMN "likeCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FeedPost" ADD COLUMN "replyCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FeedPost" ADD COLUMN "retweetCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FeedPost" ADD COLUMN "quoteCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FeedPost" ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "FeedPost_communityId_authorHandle_idx" ON "FeedPost"("communityId", "authorHandle");
