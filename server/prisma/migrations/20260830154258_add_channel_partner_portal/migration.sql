-- CreateEnum
CREATE TYPE "ChannelPartnerUserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "EmailCampaign" ADD COLUMN     "ownerChannelPartnerId" TEXT;

-- CreateTable
CREATE TABLE "ChannelPartnerUser" (
    "id" TEXT NOT NULL,
    "channelPartnerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "ChannelPartnerUserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelPartnerUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelPartnerUser_channelPartnerId_key" ON "ChannelPartnerUser"("channelPartnerId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelPartnerUser_email_key" ON "ChannelPartnerUser"("email");

-- CreateIndex
CREATE INDEX "EmailCampaign_ownerChannelPartnerId_idx" ON "EmailCampaign"("ownerChannelPartnerId");

-- AddForeignKey
ALTER TABLE "ChannelPartnerUser" ADD CONSTRAINT "ChannelPartnerUser_channelPartnerId_fkey" FOREIGN KEY ("channelPartnerId") REFERENCES "ChannelPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_ownerChannelPartnerId_fkey" FOREIGN KEY ("ownerChannelPartnerId") REFERENCES "ChannelPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
