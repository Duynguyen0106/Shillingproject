-- AlterTable
ALTER TABLE "Community" ADD COLUMN "focusPostId" TEXT;
ALTER TABLE "Community" ADD COLUMN "focusAt" TIMESTAMP(3);
ALTER TABLE "Community" ADD COLUMN "focusById" TEXT;

-- AddForeignKey
ALTER TABLE "Community" ADD CONSTRAINT "Community_focusPostId_fkey" FOREIGN KEY ("focusPostId") REFERENCES "FeedPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Community" ADD CONSTRAINT "Community_focusById_fkey" FOREIGN KEY ("focusById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
