-- DropIndex
DROP INDEX "ChannelPartner_agreementDocumentId_idx";

-- AlterTable
ALTER TABLE "DealStageRecord" ADD COLUMN     "reportAt" TIMESTAMP(3),
ADD COLUMN     "reportSubmitted" BOOLEAN NOT NULL DEFAULT false;
