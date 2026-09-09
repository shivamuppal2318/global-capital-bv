-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "zoomInfoData" JSONB,
ADD COLUMN     "zoomInfoEnrichedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ZoomInfoSettings" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "clientSecretEncrypted" TEXT,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "lastTestedAt" TIMESTAMP(3),

    CONSTRAINT "ZoomInfoSettings_pkey" PRIMARY KEY ("id")
);
