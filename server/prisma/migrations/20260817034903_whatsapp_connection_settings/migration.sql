/*
  Warnings:

  - Added the required column `webhookVerifyToken` to the `BusinessSettings` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "accessToken" TEXT,
ADD COLUMN     "appId" TEXT,
ADD COLUMN     "appSecret" TEXT,
ADD COLUMN     "autoCreateLead" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "campaignBatchSize" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "embeddedSignupConfigId" TEXT,
ADD COLUMN     "leadDefaultAssignedTo" TEXT NOT NULL DEFAULT 'Default',
ADD COLUMN     "leadDefaultSource" TEXT NOT NULL DEFAULT 'Default',
ADD COLUMN     "leadDefaultStatus" TEXT NOT NULL DEFAULT 'Default',
ADD COLUMN     "phoneNumberId" TEXT,
ADD COLUMN     "webhookVerifyToken" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "WhatsappPhoneNumber" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "qualityRating" TEXT NOT NULL DEFAULT 'Unknown',
    "status" TEXT NOT NULL DEFAULT 'Connected',
    "isSending" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappPhoneNumber_pkey" PRIMARY KEY ("id")
);
