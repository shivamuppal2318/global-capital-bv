-- AlterEnum
ALTER TYPE "EmailActivityKind" ADD VALUE 'CAMPAIGN_BLAST_SENT';

-- AlterTable
ALTER TABLE "EmailCampaign" ADD COLUMN     "bodyHtml" TEXT,
ADD COLUMN     "subject" TEXT;
