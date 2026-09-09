-- CreateEnum
CREATE TYPE "SegmentMatchType" AS ENUM ('ALL', 'ANY');

-- CreateEnum
CREATE TYPE "AiReplyDraftStatus" AS ENUM ('DRAFT', 'SENT', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "EmailSegment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "campaignId" TEXT,
    "matchType" "SegmentMatchType" NOT NULL DEFAULT 'ALL',
    "conditions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiReplyDraft" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "AiReplyDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "model" TEXT,
    "error" TEXT,
    "sentActivityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiReplyDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailSegment_campaignId_idx" ON "EmailSegment"("campaignId");

-- CreateIndex
CREATE INDEX "AiReplyDraft_leadId_idx" ON "AiReplyDraft"("leadId");

-- CreateIndex
CREATE INDEX "AiReplyDraft_status_idx" ON "AiReplyDraft"("status");

-- AddForeignKey
ALTER TABLE "EmailSegment" ADD CONSTRAINT "EmailSegment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiReplyDraft" ADD CONSTRAINT "AiReplyDraft_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "EmailLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
