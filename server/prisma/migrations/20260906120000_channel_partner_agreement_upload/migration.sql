-- A partner can upload their own signed scan/photo of the Channel Partner
-- Agreement instead of filling in the blanks online (see
-- routes/channelPartnerAgreement.js). Null when signed the fill-in-the-blanks
-- way, same as NdaRecord.documentId's own convention.
ALTER TABLE "ChannelPartner" ADD COLUMN "agreementDocumentId" TEXT;

ALTER TABLE "ChannelPartner"
ADD CONSTRAINT "ChannelPartner_agreementDocumentId_fkey"
FOREIGN KEY ("agreementDocumentId") REFERENCES "Document"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ChannelPartner_agreementDocumentId_idx" ON "ChannelPartner"("agreementDocumentId");
