ALTER TABLE "EmailCampaign" ADD COLUMN "ownerId" TEXT;

CREATE INDEX "EmailCampaign_ownerId_idx" ON "EmailCampaign"("ownerId");

ALTER TABLE "EmailCampaign"
ADD CONSTRAINT "EmailCampaign_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
