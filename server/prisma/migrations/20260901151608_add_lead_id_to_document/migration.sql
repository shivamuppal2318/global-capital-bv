-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "leadId" TEXT;

-- CreateIndex
CREATE INDEX "Document_leadId_idx" ON "Document"("leadId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
