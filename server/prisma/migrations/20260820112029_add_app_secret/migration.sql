-- CreateTable
CREATE TABLE "AppSecret" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSecret_pkey" PRIMARY KEY ("key")
);
