-- CreateEnum
CREATE TYPE "EmailCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ReplyType" AS ENUM ('INTERESTED', 'ZOOM_REQUEST', 'INFO_REQUEST', 'NO_REPLY');

-- CreateEnum
CREATE TYPE "EmailActivityKind" AS ENUM ('BULK_INTRO_SENT', 'REPLY_RECEIVED', 'BRANCH_EMAIL_QUEUED', 'BRANCH_EMAIL_SENT', 'STAGE_CHANGED', 'MANUAL_NOTE', 'BOUNCED', 'SEND_BLOCKED', 'NDA_SIGNED', 'CALL_BOOKED', 'CALL_CANCELED', 'CALL_COMPLETED', 'EMAIL_OPENED', 'LINK_CLICKED');

-- CreateEnum
CREATE TYPE "BounceKind" AS ENUM ('HARD', 'SOFT', 'COMPLAINT');

-- CreateEnum
CREATE TYPE "SignalSource" AS ENUM ('NEWSAPI', 'EXA', 'FIRECRAWL', 'GOOGLE_NEWS');

-- CreateEnum
CREATE TYPE "SignalType" AS ENUM ('FUNDING', 'ACQUISITION', 'EXPANSION', 'LEADERSHIP_CHANGE', 'DISTRESS', 'OTHER');

-- CreateEnum
CREATE TYPE "SignalStatus" AS ENUM ('PENDING', 'PROCESSED', 'DUPLICATE', 'IGNORED', 'FAILED');

-- CreateTable
CREATE TABLE "EmailCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "EmailCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "audience" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "dailyLimit" INTEGER NOT NULL DEFAULT 2000,
    "delayDays" INTEGER NOT NULL DEFAULT 3,
    "followUpCount" INTEGER NOT NULL DEFAULT 3,
    "abTest" BOOLEAN NOT NULL DEFAULT true,
    "autoPause" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "emailAccountId" TEXT,

    CONSTRAINT "EmailCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAccount" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "smtpHost" TEXT NOT NULL,
    "smtpPort" INTEGER NOT NULL,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "smtpUser" TEXT NOT NULL,
    "smtpPassEncrypted" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "dailyLimit" INTEGER NOT NULL DEFAULT 500,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CadenceStep" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "bodyTemplate" TEXT NOT NULL,
    "delayDays" INTEGER NOT NULL,

    CONSTRAINT "CadenceStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "replyType" "ReplyType" NOT NULL DEFAULT 'NO_REPLY',
    "stage" TEXT NOT NULL DEFAULT 'Reminder Pending',
    "unsubscribed" BOOLEAN NOT NULL DEFAULT false,
    "bounced" BOOLEAN NOT NULL DEFAULT false,
    "bounceKind" "BounceKind",
    "ndaSignedAt" TIMESTAMP(3),
    "ndaSignedName" TEXT,
    "ndaSignedIp" TEXT,
    "callBookedAt" TIMESTAMP(3),
    "callScheduledFor" TIMESTAMP(3),
    "callCanceledAt" TIMESTAMP(3),
    "callCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplyEvent" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "rawBody" TEXT NOT NULL,
    "matchedRule" TEXT,
    "replyType" "ReplyType" NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReplyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailActivityLog" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "kind" "EmailActivityKind" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "html" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSignal" (
    "id" TEXT NOT NULL,
    "source" "SignalSource" NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "rawTitle" TEXT NOT NULL,
    "rawContent" TEXT NOT NULL,
    "rawPublishedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentHash" TEXT NOT NULL,
    "status" "SignalStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "entityName" TEXT,
    "signalType" "SignalType",
    "relevanceScore" INTEGER,
    "aiSummary" TEXT,
    "matchedLeadId" TEXT,
    "createdLeadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailCampaign_status_idx" ON "EmailCampaign"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CadenceStep_campaignId_stepIndex_key" ON "CadenceStep"("campaignId", "stepIndex");

-- CreateIndex
CREATE INDEX "EmailLead_campaignId_idx" ON "EmailLead"("campaignId");

-- CreateIndex
CREATE INDEX "EmailLead_email_idx" ON "EmailLead"("email");

-- CreateIndex
CREATE INDEX "EmailActivityLog_leadId_createdAt_idx" ON "EmailActivityLog"("leadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_key_key" ON "EmailTemplate"("key");

-- CreateIndex
CREATE UNIQUE INDEX "MarketSignal_contentHash_key" ON "MarketSignal"("contentHash");

-- CreateIndex
CREATE INDEX "MarketSignal_status_idx" ON "MarketSignal"("status");

-- CreateIndex
CREATE INDEX "MarketSignal_entityName_idx" ON "MarketSignal"("entityName");

-- AddForeignKey
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadenceStep" ADD CONSTRAINT "CadenceStep_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLead" ADD CONSTRAINT "EmailLead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplyEvent" ADD CONSTRAINT "ReplyEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "EmailLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailActivityLog" ADD CONSTRAINT "EmailActivityLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "EmailLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSignal" ADD CONSTRAINT "MarketSignal_matchedLeadId_fkey" FOREIGN KEY ("matchedLeadId") REFERENCES "EmailLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSignal" ADD CONSTRAINT "MarketSignal_createdLeadId_fkey" FOREIGN KEY ("createdLeadId") REFERENCES "EmailLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
