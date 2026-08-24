-- Zoom Call: post-call capture fields.
-- All nullable (or defaulted) so existing meetings stay valid — a meeting
-- booked yesterday has none of this recorded yet.
ALTER TABLE "Meeting"
  ADD COLUMN "clientAttendees" TEXT,
  ADD COLUMN "ourAttendees" TEXT,
  ADD COLUMN "actualDurationMinutes" INTEGER,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "aiSummary" TEXT,
  ADD COLUMN "aiSummaryUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "nextAction" TEXT,
  ADD COLUMN "nextActionDueAt" TIMESTAMP(3),
  ADD COLUMN "nextMeetingScheduled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recordingLink" TEXT,
  ADD COLUMN "clientSatisfaction" INTEGER;

-- Meeting_startTime_idx already exists (20260818125802_zoom_meetings); the
-- @@index in the schema documents it, it does not need re-creating here.

-- NDA tracking -----------------------------------------------------------
CREATE TYPE "NdaStatus" AS ENUM ('DRAFT', 'SENT', 'REMINDER_1', 'REMINDER_2', 'SIGNED', 'DECLINED', 'EXPIRED');

CREATE TABLE "NdaRecord" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "status" "NdaStatus" NOT NULL DEFAULT 'DRAFT',
  "sentAt" TIMESTAMP(3),
  "reminder1At" TIMESTAMP(3),
  "reminder2At" TIMESTAMP(3),
  "signedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "signerName" TEXT,
  "signerEmail" TEXT,
  "owner" TEXT,
  "notes" TEXT,
  "documentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NdaRecord_pkey" PRIMARY KEY ("id")
);

-- One NDA per lead: the second attempt to record one should update the
-- existing row, not create a rival copy with a different status.
CREATE UNIQUE INDEX "NdaRecord_leadId_key" ON "NdaRecord"("leadId");
CREATE INDEX "NdaRecord_status_idx" ON "NdaRecord"("status");

ALTER TABLE "NdaRecord" ADD CONSTRAINT "NdaRecord_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SET NULL, not CASCADE: deleting the attached PDF from the Data Room must
-- not erase the record that an NDA was signed.
ALTER TABLE "NdaRecord" ADD CONSTRAINT "NdaRecord_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Visit planning ---------------------------------------------------------
CREATE TYPE "VisitPlanStatus" AS ENUM ('PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

CREATE TABLE "VisitPlan" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "status" "VisitPlanStatus" NOT NULL DEFAULT 'PLANNED',
  "plannedFor" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "location" TEXT,
  "region" TEXT,
  "country" TEXT,
  "attendees" TEXT,
  "purpose" TEXT,
  "notes" TEXT,
  "owner" TEXT,
  "costAmount" DOUBLE PRECISION,
  "costCurrency" TEXT NOT NULL DEFAULT 'EUR',
  "travelMode" TEXT,
  "reportSubmitted" BOOLEAN NOT NULL DEFAULT false,
  "reportAt" TIMESTAMP(3),
  "reportId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VisitPlan_pkey" PRIMARY KEY ("id")
);

-- Not unique on leadId: unlike an NDA, the same counterparty can be visited
-- repeatedly, and each trip has its own cost and report.
CREATE INDEX "VisitPlan_status_idx" ON "VisitPlan"("status");
CREATE INDEX "VisitPlan_plannedFor_idx" ON "VisitPlan"("plannedFor");
CREATE INDEX "VisitPlan_region_idx" ON "VisitPlan"("region");

ALTER TABLE "VisitPlan" ADD CONSTRAINT "VisitPlan_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisitPlan" ADD CONSTRAINT "VisitPlan_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AI data sources --------------------------------------------------------
-- 'nda' and 'visits' are brand new source ids. An admin who saved an
-- explicit source selection before today could not possibly have unticked
-- them, so leaving them out would silently hide the new modules from the
-- assistant. Append them where they are missing, but only to rows that
-- already have a selection: an empty array means "no database access", and
-- that IS a deliberate choice worth respecting.
UPDATE "AiSettings"
SET "dataSources" = "dataSources" || ARRAY['nda']::TEXT[]
WHERE cardinality("dataSources") > 0 AND NOT ('nda' = ANY("dataSources"));

UPDATE "AiSettings"
SET "dataSources" = "dataSources" || ARRAY['visits']::TEXT[]
WHERE cardinality("dataSources") > 0 AND NOT ('visits' = ANY("dataSources"));

-- 'deal-stages' was added after the earlier backfill ran, so rows still
-- holding exactly that backfilled list never had the chance to include it.
-- Matching the exact list is the proof it was never edited by hand, which
-- is why this cannot overwrite a deliberate choice.
UPDATE "AiSettings"
SET "dataSources" = "dataSources" || ARRAY['deal-stages']::TEXT[]
WHERE NOT ('deal-stages' = ANY("dataSources"))
  AND "dataSources" @> ARRAY[
    'leads','follow-ups','meetings','whatsapp','email-campaigns',
    'team','employees','market-signals','documents'
  ]::TEXT[];
