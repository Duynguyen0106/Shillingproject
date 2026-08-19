-- AlterTable
ALTER TABLE "Community" ADD COLUMN "xCommunityUrl" TEXT;
ALTER TABLE "Community" ADD COLUMN "xCommunityId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Community_xCommunityId_key" ON "Community"("xCommunityId");
