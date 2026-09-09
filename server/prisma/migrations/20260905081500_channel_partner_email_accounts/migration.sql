-- Channel Partner portal mailboxes. Staff mailboxes continue to use ownerId;
-- partner mailboxes use ownerChannelPartnerId so the two identity tiers never
-- share a foreign key namespace.
ALTER TABLE "EmailAccount" ADD COLUMN "ownerChannelPartnerId" TEXT;

ALTER TABLE "EmailAccount"
ADD CONSTRAINT "EmailAccount_ownerChannelPartnerId_fkey"
FOREIGN KEY ("ownerChannelPartnerId") REFERENCES "ChannelPartner"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "EmailAccount_ownerChannelPartnerId_idx" ON "EmailAccount"("ownerChannelPartnerId");
