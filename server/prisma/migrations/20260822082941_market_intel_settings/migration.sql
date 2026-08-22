-- CreateTable
CREATE TABLE "MarketIntelSettings" (
    "id" TEXT NOT NULL,
    "exaApiKeyEncrypted" TEXT,
    "newsApiKeyEncrypted" TEXT,
    "firecrawlApiKeyEncrypted" TEXT,
    "apolloApiKeyEncrypted" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketIntelSettings_pkey" PRIMARY KEY ("id")
);
