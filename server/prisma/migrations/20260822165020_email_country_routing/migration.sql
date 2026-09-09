-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "country" TEXT;

-- AlterTable
ALTER TABLE "EmailActivityLog" ADD COLUMN     "emailAccountId" TEXT;

-- AlterTable
ALTER TABLE "EmailLead" ADD COLUMN     "country" TEXT;

-- CreateIndex
CREATE INDEX "EmailAccount_country_idx" ON "EmailAccount"("country");

-- CreateIndex
CREATE INDEX "EmailActivityLog_emailAccountId_kind_createdAt_idx" ON "EmailActivityLog"("emailAccountId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "EmailActivityLog" ADD CONSTRAINT "EmailActivityLog_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
