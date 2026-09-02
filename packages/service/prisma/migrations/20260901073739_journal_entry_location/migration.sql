-- AlterTable
ALTER TABLE "qianlai_journal_entry" ADD COLUMN     "address" TEXT,
ADD COLUMN     "addressName" TEXT,
ADD COLUMN     "latitude" DECIMAL(9,6),
ADD COLUMN     "longitude" DECIMAL(9,6);
