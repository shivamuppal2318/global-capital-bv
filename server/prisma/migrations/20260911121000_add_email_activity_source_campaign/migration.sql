ALTER TABLE "EmailActivityLog" ADD COLUMN "sourceCampaignId" TEXT;

ALTER TABLE "EmailActivityLog"
ADD CONSTRAINT "EmailActivityLog_sourceCampaignId_fkey"
FOREIGN KEY ("sourceCampaignId") REFERENCES "EmailCampaign"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "EmailActivityLog_sourceCampaignId_kind_createdAt_idx"
ON "EmailActivityLog"("sourceCampaignId", "kind", "createdAt");
