-- AlterTable
ALTER TABLE "MarketSignal" ADD COLUMN     "zoomInfoCompanyData" JSONB,
ADD COLUMN     "zoomInfoEnrichedAt" TIMESTAMP(3),
ADD COLUMN     "zoomInfoScoops" JSONB;
