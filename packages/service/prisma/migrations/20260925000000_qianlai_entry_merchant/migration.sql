-- Optional counterparty (商家) on journal entries — pure annotation like
-- the location columns, never read by balances/settlement/reports.
ALTER TABLE "qianlai_journal_entry" ADD COLUMN "merchant" TEXT;
