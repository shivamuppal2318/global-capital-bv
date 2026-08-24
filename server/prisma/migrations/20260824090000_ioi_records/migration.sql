-- Indications of interest ------------------------------------------------
CREATE TYPE "IoiStatus" AS ENUM ('DRAFT', 'GENERATED', 'SENT', 'SIGNED', 'DECLINED', 'EXPIRED');

CREATE TABLE "IoiRecord" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "status" "IoiStatus" NOT NULL DEFAULT 'DRAFT',
  "generatedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "signedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "value" DOUBLE PRECISION,
  "valueCurrency" TEXT NOT NULL DEFAULT 'EUR',
  "industry" TEXT,
  "geography" TEXT,
  "counterparty" TEXT,
  "owner" TEXT,
  "notes" TEXT,
  "documentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IoiRecord_pkey" PRIMARY KEY ("id")
);

-- One IOI per lead: recording the same lead twice should update the row,
-- not create a rival copy that every count would then double.
CREATE UNIQUE INDEX "IoiRecord_leadId_key" ON "IoiRecord"("leadId");
CREATE INDEX "IoiRecord_status_idx" ON "IoiRecord"("status");
CREATE INDEX "IoiRecord_industry_idx" ON "IoiRecord"("industry");
CREATE INDEX "IoiRecord_geography_idx" ON "IoiRecord"("geography");

ALTER TABLE "IoiRecord" ADD CONSTRAINT "IoiRecord_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SET NULL, not CASCADE: deleting the PDF from the Data Room must not erase
-- the record that an IOI was issued.
ALTER TABLE "IoiRecord" ADD CONSTRAINT "IoiRecord_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The IOI module is new to the assistant's data sources. Existing explicit
-- selections cannot have deliberately excluded it, so append it where it is
-- missing — but only where a selection exists at all, since an empty array
-- means "no database access" and that IS a deliberate choice.
UPDATE "AiSettings"
SET "dataSources" = "dataSources" || ARRAY['ioi']::TEXT[]
WHERE cardinality("dataSources") > 0 AND NOT ('ioi' = ANY("dataSources"));
