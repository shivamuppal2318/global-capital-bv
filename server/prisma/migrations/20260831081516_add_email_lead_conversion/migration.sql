-- AlterTable
ALTER TABLE "EmailLead" ADD COLUMN     "convertedAt" TIMESTAMP(3),
ADD COLUMN     "convertedToLeadId" TEXT;
