-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('NDA', 'ZOOM_CALL', 'DATA_ROOM', 'IOI', 'VISIT_PLANNING', 'FIELD_VISIT', 'TERM_SHEET');

-- CreateEnum
CREATE TYPE "DealStageStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED', 'ON_HOLD');

-- CreateTable
CREATE TABLE "DealStageRecord" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "stage" "DealStage" NOT NULL,
    "status" "DealStageStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "amount" TEXT,
    "valuation" TEXT,
    "location" TEXT,
    "attendees" TEXT,
    "counterparty" TEXT,
    "notes" TEXT,
    "owner" TEXT,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealStageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DealStageRecord_leadId_stage_key" ON "DealStageRecord"("leadId", "stage");

-- CreateIndex
CREATE INDEX "DealStageRecord_stage_status_idx" ON "DealStageRecord"("stage", "status");

-- AddForeignKey
ALTER TABLE "DealStageRecord" ADD CONSTRAINT "DealStageRecord_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStageRecord" ADD CONSTRAINT "DealStageRecord_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing installs have AiSettings.dataSources pinned to an explicit list,
-- so a newly added source would be absent and therefore off. Add it to rows
-- that already list others, matching the "on by default" intent.
UPDATE "AiSettings"
SET "dataSources" = array_append("dataSources", 'deal-stages')
WHERE cardinality("dataSources") > 0 AND NOT ('deal-stages' = ANY("dataSources"));
