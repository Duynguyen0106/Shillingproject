-- AlterTable
ALTER TABLE "Mission" ADD COLUMN "pinText" TEXT;
ALTER TABLE "Mission" ADD COLUMN "pinnedAt" TIMESTAMP(3);
ALTER TABLE "Mission" ADD COLUMN "pinnedById" TEXT;

-- CreateTable
CREATE TABLE "MissionCheckIn" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MissionCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MissionCheckIn_missionId_userId_key" ON "MissionCheckIn"("missionId", "userId");
CREATE INDEX "MissionCheckIn_missionId_idx" ON "MissionCheckIn"("missionId");

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MissionCheckIn" ADD CONSTRAINT "MissionCheckIn_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MissionCheckIn" ADD CONSTRAINT "MissionCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
