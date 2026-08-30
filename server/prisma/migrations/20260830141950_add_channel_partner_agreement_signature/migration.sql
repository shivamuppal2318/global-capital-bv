-- AlterTable
ALTER TABLE "ChannelPartner" ADD COLUMN     "agreementSignedAt" TIMESTAMP(3),
ADD COLUMN     "agreementSignedIp" TEXT,
ADD COLUMN     "agreementSignedName" TEXT;
