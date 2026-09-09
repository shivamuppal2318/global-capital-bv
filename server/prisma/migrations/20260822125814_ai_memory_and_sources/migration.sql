-- AlterTable
ALTER TABLE "AiSettings" ADD COLUMN     "dataSources" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "companyProfile" TEXT;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "pinnedToAi" BOOLEAN NOT NULL DEFAULT false;
