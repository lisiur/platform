//
//  LocalSchema.swift
//  Qianlai
//

import Foundation
import GRDB

/// The local ledger database's schema, one linear GRDB migration per
/// version (C2). The v1 tables mirror the server's `qianlai_*` Prisma
/// models 1:1 with the column mappings pinned in the dev plan §2:
///
/// - ids stay TEXT and stable (they double as CloudKit recordName and
///   transfer-document key);
/// - `Decimal(12,2)` money lands as INTEGER cents (aligned with the
///   client's `entryValueCents` rounding, `Math.round(Number(x) * 100)`);
/// - Postgres arrays (`budgetExcludedAccountIds`, `flags`) and `meta` Json
///   land as TEXT holding a JSON array/object, stored and read whole;
/// - timestamps land as TEXT in UTC ISO8601 (fractional seconds), parsed
///   back by `LocalTimestamp`;
/// - the day-bucketing key every summary needs is a DERIVED column
///   (`journal_entry.date_day_key`), written with the row under the
///   posting request's tz offset — the same `localDayKey` rule the server
///   aggregates with ((instant + offset) floored to a UTC day), so local
///   windows never re-derive the bucket from an unparsed instant;
/// - search rides `journal_entry_fts` (FTS5, unicode61) with triggers
///   keeping it aligned; Chinese recall is validated in phase 2 and the
///   LIKE fallback stays the escape hatch.
nonisolated enum LocalSchema {
    /// Registers every schema migration, oldest first, onto the caller's
    /// migrator. Called from `LocalDatabase.init` — opening the database
    /// migrates it; idempotent because GRDB records applied versions in
    /// `grdb_migrations`.
    static func register(migrator: inout DatabaseMigrator) {
        registerV1(&migrator)
    }

    private static func registerV1(_ migrator: inout DatabaseMigrator) {
        migrator.registerMigration("v1") { db in
            // Ledger -----------------------------------------------------------------
            try db.execute(sql: """
                CREATE TABLE qianlai_ledger (
                    id TEXT PRIMARY KEY NOT NULL,
                    owner_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT,
                    currency TEXT NOT NULL DEFAULT 'CNY',
                    status TEXT NOT NULL DEFAULT 'active',
                    is_default BOOLEAN NOT NULL DEFAULT 0,
                    -- Monotonic per-ledger counter backing entryNo; bumped in the
                    -- entry-insert write transaction, never reused on delete.
                    last_entry_no INTEGER NOT NULL DEFAULT 0,
                    -- Postgres String[] → JSON array text, stored and read whole.
                    budget_excluded_account_ids TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """)

            try db.execute(sql: """
                CREATE TABLE qianlai_ledger_member (
                    id TEXT PRIMARY KEY NOT NULL,
                    ledger_id TEXT NOT NULL REFERENCES qianlai_ledger(id) ON DELETE CASCADE,
                    user_id TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'owner',
                    created_at TEXT NOT NULL,
                    UNIQUE (ledger_id, user_id)
                )
                """)

            // Accounts ---------------------------------------------------------------
            try db.execute(sql: """
                CREATE TABLE qianlai_book_account (
                    id TEXT PRIMARY KEY NOT NULL,
                    ledger_id TEXT NOT NULL REFERENCES qianlai_ledger(id) ON DELETE CASCADE,
                    name TEXT,
                    code TEXT,
                    type TEXT NOT NULL,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    parent_id TEXT REFERENCES qianlai_book_account(id) ON DELETE CASCADE,
                    status TEXT NOT NULL DEFAULT 'active',
                    icon TEXT,
                    flags TEXT NOT NULL DEFAULT '[]',
                    meta TEXT,
                    real_account_id TEXT REFERENCES qianlai_real_account(id) ON DELETE SET NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """)
            // @@unique([ledgerId, code]) parity; SQLite treats NULLs as distinct,
            // so user-created accounts (code NULL) never collide.
            try db.execute(sql: """
                CREATE UNIQUE INDEX qianlai_book_account_ledger_code
                    ON qianlai_book_account (ledger_id, code)
                """)
            try db.execute(sql: """
                CREATE INDEX qianlai_book_account_ledger_sort
                    ON qianlai_book_account (ledger_id, sort_order)
                """)

            // Real accounts ----------------------------------------------------------
            try db.execute(sql: """
                CREATE TABLE qianlai_real_account (
                    id TEXT PRIMARY KEY NOT NULL,
                    owner_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active',
                    icon TEXT,
                    meta TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """)
            try db.execute(sql: """
                CREATE INDEX qianlai_real_account_owner
                    ON qianlai_real_account (owner_id)
                """)

            // Journal ----------------------------------------------------------------
            try db.execute(sql: """
                CREATE TABLE qianlai_journal_entry (
                    id TEXT PRIMARY KEY NOT NULL,
                    ledger_id TEXT NOT NULL REFERENCES qianlai_ledger(id) ON DELETE CASCADE,
                    entry_no INTEGER NOT NULL,
                    date TEXT NOT NULL,
                    -- Derived bucket: localDayKey(date, tzOffsetMinutes) captured at
                    -- write time. Never re-derived on read.
                    date_day_key TEXT NOT NULL,
                    memo TEXT,
                    status TEXT NOT NULL DEFAULT 'posted',
                    counts_in_ledger BOOLEAN NOT NULL DEFAULT 1,
                    guest_created BOOLEAN NOT NULL DEFAULT 0,
                    excluded_from_budget BOOLEAN NOT NULL DEFAULT 0,
                    created_by_id TEXT,
                    paid_by_id TEXT,
                    project_id TEXT REFERENCES qianlai_project(id) ON DELETE SET NULL,
                    address TEXT,
                    address_name TEXT,
                    latitude REAL,
                    longitude REAL,
                    merchant TEXT,
                    created_at TEXT NOT NULL,
                    UNIQUE (ledger_id, entry_no)
                )
                """)
            try db.execute(sql: """
                CREATE INDEX qianlai_journal_entry_ledger_date
                    ON qianlai_journal_entry (ledger_id, date)
                """)

            try db.execute(sql: """
                CREATE TABLE qianlai_journal_line (
                    id TEXT PRIMARY KEY NOT NULL,
                    entry_id TEXT NOT NULL REFERENCES qianlai_journal_entry(id) ON DELETE CASCADE,
                    account_id TEXT NOT NULL REFERENCES qianlai_book_account(id) ON DELETE RESTRICT,
                    debit_cents INTEGER NOT NULL DEFAULT 0,
                    credit_cents INTEGER NOT NULL DEFAULT 0,
                    memo TEXT
                )
                """)
            try db.execute(sql: """
                CREATE INDEX qianlai_journal_line_account
                    ON qianlai_journal_line (account_id)
                """)

            try db.execute(sql: """
                CREATE TABLE qianlai_journal_entry_participant (
                    id TEXT PRIMARY KEY NOT NULL,
                    entry_id TEXT NOT NULL REFERENCES qianlai_journal_entry(id) ON DELETE CASCADE,
                    user_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE (entry_id, user_id)
                )
                """)
            try db.execute(sql: """
                CREATE INDEX qianlai_journal_entry_participant_user
                    ON qianlai_journal_entry_participant (user_id)
                """)

            // Projects ---------------------------------------------------------------
            try db.execute(sql: """
                CREATE TABLE qianlai_project (
                    id TEXT PRIMARY KEY NOT NULL,
                    ledger_id TEXT NOT NULL REFERENCES qianlai_ledger(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    description TEXT,
                    status TEXT NOT NULL DEFAULT 'active',
                    start_date TEXT,
                    end_date TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """)
            try db.execute(sql: """
                CREATE TABLE qianlai_project_member (
                    id TEXT PRIMARY KEY NOT NULL,
                    project_id TEXT NOT NULL REFERENCES qianlai_project(id) ON DELETE CASCADE,
                    user_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE (project_id, user_id)
                )
                """)

            // Budgets ----------------------------------------------------------------
            try db.execute(sql: """
                CREATE TABLE qianlai_ledger_budget_year (
                    id TEXT PRIMARY KEY NOT NULL,
                    ledger_id TEXT NOT NULL REFERENCES qianlai_ledger(id) ON DELETE CASCADE,
                    year INTEGER NOT NULL,
                    cents INTEGER NOT NULL,
                    UNIQUE (ledger_id, year)
                )
                """)
            try db.execute(sql: """
                CREATE TABLE qianlai_ledger_budget_month_override (
                    id TEXT PRIMARY KEY NOT NULL,
                    budget_year_id TEXT NOT NULL REFERENCES qianlai_ledger_budget_year(id) ON DELETE CASCADE,
                    month INTEGER NOT NULL,
                    cents INTEGER NOT NULL,
                    UNIQUE (budget_year_id, month)
                )
                """)
            try db.execute(sql: """
                CREATE TABLE qianlai_ledger_category_budget_year (
                    id TEXT PRIMARY KEY NOT NULL,
                    ledger_id TEXT NOT NULL REFERENCES qianlai_ledger(id) ON DELETE CASCADE,
                    account_id TEXT NOT NULL REFERENCES qianlai_book_account(id) ON DELETE CASCADE,
                    year INTEGER NOT NULL,
                    cents INTEGER NOT NULL,
                    UNIQUE (ledger_id, year, account_id)
                )
                """)

            // Preferences ------------------------------------------------------------
            try db.execute(sql: """
                CREATE TABLE qianlai_user_preference (
                    id TEXT PRIMARY KEY NOT NULL,
                    user_id TEXT NOT NULL,
                    scope_type TEXT NOT NULL,
                    scope_id TEXT NOT NULL DEFAULT '',
                    -- Json → JSON text, stored and read whole.
                    data TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE (user_id, scope_type, scope_id)
                )
                """)

            // Search -----------------------------------------------------------------
            // Contentless FTS5 over the entry's free-text columns; the UNINDEXED
            // entry id joins back to the row. unicode61 splits CJK per codepoint
            // (per-character recall) — phase 2 validates the quality and the LIKE
            // fallback remains the degradation path.
            try db.execute(sql: """
                CREATE VIRTUAL TABLE journal_entry_fts USING fts5(
                    entry_id UNINDEXED,
                    memo,
                    merchant,
                    address_name,
                    tokenize = 'unicode61'
                )
                """)
            try db.execute(sql: """
                CREATE TRIGGER journal_entry_ai AFTER INSERT ON qianlai_journal_entry BEGIN
                    INSERT INTO journal_entry_fts (entry_id, memo, merchant, address_name)
                    VALUES (new.id, new.memo, new.merchant, new.address_name);
                END
                """)
            try db.execute(sql: """
                CREATE TRIGGER journal_entry_ad AFTER DELETE ON qianlai_journal_entry BEGIN
                    INSERT INTO journal_entry_fts (journal_entry_fts, entry_id, memo, merchant, address_name)
                    VALUES ('delete', old.id, old.memo, old.merchant, old.address_name);
                END
                """)
            try db.execute(sql: """
                CREATE TRIGGER journal_entry_au AFTER UPDATE ON qianlai_journal_entry BEGIN
                    INSERT INTO journal_entry_fts (journal_entry_fts, entry_id, memo, merchant, address_name)
                    VALUES ('delete', old.id, old.memo, old.merchant, old.address_name);
                    INSERT INTO journal_entry_fts (entry_id, memo, merchant, address_name)
                    VALUES (new.id, new.memo, new.merchant, new.address_name);
                END
                """)
        }
    }
}
