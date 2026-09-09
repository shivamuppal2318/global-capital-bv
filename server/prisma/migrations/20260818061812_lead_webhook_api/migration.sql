-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "leadWebhookApiKey" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "rawPayload" JSONB;
