-- CreateTable
CREATE TABLE "qianlai_ledger_category_budget_year" (
    "id" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "cents" INTEGER NOT NULL,

    CONSTRAINT "qianlai_ledger_category_budget_year_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "qianlai_ledger_category_budget_year_ledgerId_year_accountId_key" ON "qianlai_ledger_category_budget_year"("ledgerId", "year", "accountId");

-- AddForeignKey
ALTER TABLE "qianlai_ledger_category_budget_year" ADD CONSTRAINT "qianlai_ledger_category_budget_year_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "qianlai_ledger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qianlai_ledger_category_budget_year" ADD CONSTRAINT "qianlai_ledger_category_budget_year_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "qianlai_book_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
