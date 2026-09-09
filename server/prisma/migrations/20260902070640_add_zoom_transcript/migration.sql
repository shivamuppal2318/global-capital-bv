-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "transcriptFetchedAt" TIMESTAMP(3),
ADD COLUMN     "transcriptSummary" TEXT,
ADD COLUMN     "transcriptSummaryUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "transcriptText" TEXT,
ADD COLUMN     "zoomRecordingUuid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_zoomRecordingUuid_key" ON "Meeting"("zoomRecordingUuid");
