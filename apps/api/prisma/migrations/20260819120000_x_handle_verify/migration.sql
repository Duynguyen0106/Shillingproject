-- AlterTable
ALTER TABLE "User" ADD COLUMN "xHandle" TEXT;
ALTER TABLE "User" ADD COLUMN "xVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "xVerifyToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_xHandle_key" ON "User"("xHandle");
