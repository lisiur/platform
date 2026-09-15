-- AlterTable
ALTER TABLE "qianlai_journal_entry" ADD COLUMN     "excludedFromBudget" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "qianlai_ledger" ADD COLUMN     "budgetExcludedAccountIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "qianlai_ledger_budget_year" (
    "id" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "cents" INTEGER NOT NULL,

    CONSTRAINT "qianlai_ledger_budget_year_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qianlai_ledger_budget_month_override" (
    "id" TEXT NOT NULL,
    "budgetYearId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "cents" INTEGER NOT NULL,

    CONSTRAINT "qianlai_ledger_budget_month_override_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "qianlai_ledger_budget_year_ledgerId_year_key" ON "qianlai_ledger_budget_year"("ledgerId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "qianlai_ledger_budget_month_override_budgetYearId_month_key" ON "qianlai_ledger_budget_month_override"("budgetYearId", "month");

-- AddForeignKey
ALTER TABLE "qianlai_ledger_budget_year" ADD CONSTRAINT "qianlai_ledger_budget_year_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "qianlai_ledger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qianlai_ledger_budget_month_override" ADD CONSTRAINT "qianlai_ledger_budget_month_override_budgetYearId_fkey" FOREIGN KEY ("budgetYearId") REFERENCES "qianlai_ledger_budget_year"("id") ON DELETE CASCADE ON UPDATE CASCADE;
