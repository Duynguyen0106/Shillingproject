-- AlterTable
ALTER TABLE "ShortLink" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE INDEX "ShortLink_userId_idx" ON "ShortLink"("userId");
CREATE INDEX "ShortLink_missionId_userId_idx" ON "ShortLink"("missionId", "userId");

-- AddForeignKey
ALTER TABLE "ShortLink" ADD CONSTRAINT "ShortLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
