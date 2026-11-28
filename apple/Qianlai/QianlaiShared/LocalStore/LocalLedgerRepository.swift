//
//  LocalLedgerRepository.swift
//  Qianlai
//

import Foundation
import GRDB

/// Local-ledger lifecycle (T1.5): create (with the seeded starter chart),
/// list, read, update, archive toggle, delete. Mirrors the cloud ledger
/// service's semantics (create transaction: ledger row + owner member row
/// + starter accounts) with the local differences C1/C8 pin: ownerId and
/// the single member row carry the per-install local identity, the
/// serialized ledger always reads myRole=owner / membersCount=1 /
/// shared=false / storage=local.
///
/// List ordering mirrors `ledgerRepository.listForUser` + the service's
/// in-memory sort: default-first among own ledgers, then creation order.
nonisolated final class LocalLedgerRepository {
    let database: LocalDatabase

    init(database: LocalDatabase) {
        self.database = database
    }

    // MARK: - Reads

    /// Every local ledger, default-first then creation order (the cloud
    /// list's contract).
    func list() async throws -> [QianlaiLedger] {
        let rows = try await database.writer.read { db in
            try LocalLedgerRow
                .order(Column("created_at"))
                .fetchAll(db)
        }
        return rows.map(serialize)
    }

    func ledger(id: String) async throws -> QianlaiLedger? {
        let row = try await database.writer.read { db in
            try LocalLedgerRow.fetchOne(db, key: id)
        }
        return row.map(serialize)
    }

    /// The local ids — the routing registry's source of truth.
    func ledgerIds() async throws -> Set<String> {
        let ids = try await database.writer.read { db in
            try String.fetchAll(db, sql: "SELECT id FROM qianlai_ledger")
        }
        return Set(ids)
    }

    /// Synchronous twin of `ledgerIds()` for the rare on-main callers
    /// (the scoped sign-out sweep) that cannot await.
    func ledgerIdsBlocking() throws -> Set<String> {
        try database.writer.read { db in
            Set(try String.fetchAll(db, sql: "SELECT id FROM qianlai_ledger"))
        }
    }

    func budgetExcludedAccountIds(ledgerId: String) async throws -> [String] {
        try await database.writer.read { db in
            try String.fetchOne(
                db, sql: "SELECT budget_excluded_account_ids FROM qianlai_ledger WHERE id = ?",
                arguments: [ledgerId]
            )
        }
        .map { LocalValues.stringArray(fromJSON: $0) } ?? []
    }

    // MARK: - Writes

    /// Creates a ledger with the seeded starter chart (the cloud
    /// createLedger transaction's local twin): ledger row, owner member
    /// row, seed rows — one transaction, one id.
    @discardableResult
    func create(
        name: String,
        description: String?,
        currency: String?,
        seedStarterAccounts: Bool,
        ownerId: String,
        now: Date = Date()
    ) async throws -> QianlaiLedger {
        let id = UUID().uuidString
        let timestamp = LocalValues.timestamp(from: now)
        let row = LocalLedgerRow(
            id: id,
            ownerId: ownerId,
            name: name,
            description: description,
            currency: (currency?.count == 3 ? currency : nil) ?? "CNY",
            status: "active",
            isDefault: false,
            lastEntryNo: 0,
            budgetExcludedAccountIds: LocalLedgerRow.build(),
            createdAt: timestamp,
            updatedAt: timestamp
        )
        let member = LocalLedgerMemberRow(
            id: UUID().uuidString,
            ledgerId: id,
            userId: ownerId,
            role: "owner",
            createdAt: timestamp
        )
        let seedRows = seedStarterAccounts
            ? LocalSeed.accountRows(ledgerId: id, ownerId: ownerId, now: now)
            : []
        try await database.writer.write { db in
            try row.insert(db)
            try member.insert(db)
            for seed in seedRows {
                try seed.insert(db)
            }
        }
        return serialize(row)
    }

    func update(_ ledger: QianlaiLedger, name: String, description: String?, currency: String) async throws {
        try await database.writer.write { db in
            guard var row = try LocalLedgerRow.fetchOne(db, key: ledger.id) else {
                throw LocalStoreError.ledgerNotFound
            }
            row.name = name
            row.description = description
            if currency.count == 3 {
                row.currency = currency.uppercased()
            }
            row.updatedAt = LocalValues.timestamp(from: Date())
            try row.update(db)
        }
    }

    func setStatus(_ ledgerId: String, status: String) async throws {
        try await database.writer.write { db in
            guard var row = try LocalLedgerRow.fetchOne(db, key: ledgerId) else {
                throw LocalStoreError.ledgerNotFound
            }
            row.status = status
            row.updatedAt = LocalValues.timestamp(from: Date())
            try row.update(db)
        }
    }

    /// Replaces the budget-excluded category list (setExcludedCategories'
    /// local twin; whole-column write like the server's).
    func setBudgetExcludedAccountIds(_ ledgerId: String, ids: [String]) async throws {
        let deduped = Array(Set(ids))
        try await database.writer.write { db in
            guard var row = try LocalLedgerRow.fetchOne(db, key: ledgerId) else {
                throw LocalStoreError.ledgerNotFound
            }
            row.budgetExcludedAccountIds = LocalLedgerRow.build(excludedAccountIds: deduped)
            row.updatedAt = LocalValues.timestamp(from: Date())
            try row.update(db)
        }
    }

    /// Deletes the ledger — the row cascade (FK) wipes members, accounts,
    /// entries, lines, participants, projects, and budget rows with it.
    /// The CloudSync zone deletion rides on top in phase 2; this method
    /// stays storage-only.
    func delete(_ ledgerId: String) async throws {
        try await database.writer.write { db in
            _ = try LocalLedgerRow.deleteOne(db, key: ledgerId)
        }
    }

    // MARK: - Serialization

    /// Row → the API shape the stores already speak (C1): owner role,
    /// one member, never shared, storage .local.
    private func serialize(_ row: LocalLedgerRow) -> QianlaiLedger {
        QianlaiLedger(
            id: row.id,
            ownerId: row.ownerId,
            name: row.name,
            description: row.description,
            currency: row.currency,
            status: row.status,
            isDefault: row.isDefault,
            createdAt: LocalValues.date(fromTimestamp: row.createdAt) ?? .distantPast,
            updatedAt: LocalValues.date(fromTimestamp: row.updatedAt) ?? .distantPast,
            myRole: .owner,
            membersCount: 1,
            shared: false,
            storage: .local
        )
    }
}
