-- CreateTable
CREATE TABLE "ZoomSettings" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "clientId" TEXT,
    "clientSecret" TEXT,
    "hostEmail" TEXT,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "lastTestedAt" TIMESTAMP(3),

    CONSTRAINT "ZoomSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "topic" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "zoomMeetingId" TEXT,
    "joinUrl" TEXT,
    "startUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Scheduled',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Meeting_startTime_idx" ON "Meeting"("startTime");

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
