-- CreateTable
CREATE TABLE "ChannelPartnerPasswordResetToken" (
    "id" TEXT NOT NULL,
    "channelPartnerUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelPartnerPasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelPartnerPasswordResetToken_tokenHash_key" ON "ChannelPartnerPasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ChannelPartnerPasswordResetToken_channelPartnerUserId_idx" ON "ChannelPartnerPasswordResetToken"("channelPartnerUserId");

-- AddForeignKey
ALTER TABLE "ChannelPartnerPasswordResetToken" ADD CONSTRAINT "ChannelPartnerPasswordResetToken_channelPartnerUserId_fkey" FOREIGN KEY ("channelPartnerUserId") REFERENCES "ChannelPartnerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
