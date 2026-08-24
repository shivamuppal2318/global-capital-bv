-- CreateEnum
CREATE TYPE "LeadTemperature" AS ENUM ('HOT', 'WARM', 'COLD');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "channelPartner" TEXT,
ADD COLUMN     "doe" TIMESTAMP(3),
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "manager" TEXT,
ADD COLUMN     "teamLeader" TEXT,
ADD COLUMN     "temperature" "LeadTemperature";
