-- AlterTable
ALTER TABLE "ChannelPartnerUser" ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];
