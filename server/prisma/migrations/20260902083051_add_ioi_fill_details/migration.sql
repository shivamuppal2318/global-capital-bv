-- AlterTable
ALTER TABLE "IoiRecord" ADD COLUMN     "agreementDate" TIMESTAMP(3),
ADD COLUMN     "borrowerEquity" TEXT,
ADD COLUMN     "counterpartyJurisdiction" TEXT,
ADD COLUMN     "signatoryAddress" TEXT,
ADD COLUMN     "signatoryEmail" TEXT,
ADD COLUMN     "signatoryName" TEXT,
ADD COLUMN     "signatoryPhone" TEXT,
ADD COLUMN     "totalProjectCost" TEXT;
