ALTER TABLE "EmailLead" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'Manual / CSV';

CREATE INDEX "EmailLead_source_idx" ON "EmailLead"("source");
