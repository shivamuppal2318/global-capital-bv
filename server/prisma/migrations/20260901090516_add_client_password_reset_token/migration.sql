-- CreateTable
CREATE TABLE "ClientPasswordResetToken" (
    "id" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientPasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientPasswordResetToken_tokenHash_key" ON "ClientPasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ClientPasswordResetToken_clientUserId_idx" ON "ClientPasswordResetToken"("clientUserId");

-- AddForeignKey
ALTER TABLE "ClientPasswordResetToken" ADD CONSTRAINT "ClientPasswordResetToken_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "ClientUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
