-- Records which mailbox's real inbox a reply was actually fetched from (see
-- imapPoller.js's pollAccount), so the Mailbox tab can filter its inbox
-- view per mailbox account instead of showing one merged list regardless of
-- which account is selected. Null for replies recorded via the inbound
-- webhook or the "Simulate reply" test action, neither of which polls a
-- specific mailbox.
ALTER TABLE "ReplyEvent" ADD COLUMN "emailAccountId" TEXT;

ALTER TABLE "ReplyEvent"
ADD CONSTRAINT "ReplyEvent_emailAccountId_fkey"
FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ReplyEvent_emailAccountId_idx" ON "ReplyEvent"("emailAccountId");
