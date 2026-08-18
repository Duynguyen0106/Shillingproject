-- AlterTable
ALTER TABLE "Community" ADD COLUMN "chainId" TEXT;
ALTER TABLE "Community" ADD COLUMN "contractAddress" TEXT;
ALTER TABLE "Community" ADD COLUMN "dexUrl" TEXT;
ALTER TABLE "Community" ADD COLUMN "imageUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Community_chainId_contractAddress_key" ON "Community"("chainId", "contractAddress");
