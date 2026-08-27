-- CreateEnum
CREATE TYPE "ChannelPartnerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PROSPECTIVE');

-- CreateTable
CREATE TABLE "ChannelPartner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "region" TEXT,
    "commissionPct" DOUBLE PRECISION,
    "status" "ChannelPartnerStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelPartner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelPartner_name_key" ON "ChannelPartner"("name");

-- CreateIndex
CREATE INDEX "ChannelPartner_status_idx" ON "ChannelPartner"("status");
