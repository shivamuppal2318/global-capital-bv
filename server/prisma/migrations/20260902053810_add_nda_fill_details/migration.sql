-- AlterTable
ALTER TABLE "NdaRecord" ADD COLUMN     "agreementDate" TIMESTAMP(3),
ADD COLUMN     "counterpartyAddress" TEXT,
ADD COLUMN     "counterpartyCountry" TEXT,
ADD COLUMN     "counterpartyLegalName" TEXT,
ADD COLUMN     "signatoryName" TEXT,
ADD COLUMN     "signatoryTitle" TEXT;
