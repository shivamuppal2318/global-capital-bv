-- CreateEnum
CREATE TYPE "LeadActivityKind" AS ENUM ('EMAIL_SENT', 'STATUS_CHANGED');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "LeadActivityLog" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "kind" "LeadActivityKind" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadActivityLog_leadId_createdAt_idx" ON "LeadActivityLog"("leadId", "createdAt");

-- AddForeignKey
ALTER TABLE "LeadActivityLog" ADD CONSTRAINT "LeadActivityLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
