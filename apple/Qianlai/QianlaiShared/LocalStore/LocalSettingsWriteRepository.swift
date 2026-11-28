//
//  LocalSettingsWriteRepository.swift
//  Qianlai
//

import Foundation
import GRDB

/// The non-journal write paths (T2.1): budget year/month/close/exclusions,
/// category budgets, the account chart, projects, and real accounts —
/// every guard mirrored from the server services (archived-ledger write
/// floor, builtin-delete block, line/child delete guards, reorder's
/// parent-stability rule, expense-only exclusions).
nonisolated final class LocalSettingsWriteRepository {
    let database: LocalDatabase

    init(database: LocalDatabase) {
        self.database = database
    }

    // MARK: - Ledger write floor

    /// `requireWritableLedger`: the ledger exists and is active.
    private func activeLedgerRow(ledgerId: String, db: Database) throws -> LocalLedgerRow {
        guard let row = try LocalLedgerRow.fetchOne(db, key: ledgerId) else {
            throw LocalStoreError.ledgerNotFound
        }
        guard row.status == "active" else {
            throw LocalValidationError(message: "This ledger is archived")
        }
        return row
    }

    // MARK: - Budget (budget.service)

    /// `setYearBudget`: upserts the year row (retroactive mid-year
    /// adoption is the row's whole point).
    func setYearBudget(ledgerId: String, year: Int, cents: Int) async throws {
        try await database.writer.write { db in
            _ = try activeLedgerRow(ledgerId: ledgerId, db: db)
            let existing = try LocalBudgetYearRow
                .filter(Column("ledger_id") == ledgerId && Column("year") == year)
                .fetchOne(db)
            if let existing {
                var row = existing
                row.cents = cents
                try row.update(db)
            } else {
                try LocalBudgetYearRow(
                    id: UUID().uuidString, ledgerId: ledgerId, year: year, cents: cents
                ).insert(db)
            }
        }
    }

    /// `setMonthBudget`: upsert only, and the year row must exist — an
    /// override without a year amount is a state nothing else handles.
    func setMonthBudget(ledgerId: String, year: Int, month: Int, cents: Int) async throws {
        try await database.writer.write { db in
            _ = try activeLedgerRow(ledgerId: ledgerId, db: db)
            guard let yearRow = try LocalBudgetYearRow
                .filter(Column("ledger_id") == ledgerId && Column("year") == year)
                .fetchOne(db)
            else {
                throw LocalValidationError(message: "Set the year's monthly budget before adjusting single months")
            }
            let existing = try LocalBudgetMonthOverrideRow
                .filter(Column("budget_year_id") == yearRow.id && Column("month") == month)
                .fetchOne(db)
            if let existing {
                var row = existing
                row.cents = cents
                try row.update(db)
            } else {
                try LocalBudgetMonthOverrideRow(
                    id: UUID().uuidString, budgetYearId: yearRow.id, month: month, cents: cents
                ).insert(db)
            }
        }
    }

    /// `closeYearBudget`: the year row (and its month pins, by cascade)
    /// disappear — the only deletion the budget has.
    func closeYearBudget(ledgerId: String, year: Int) async throws {
        try await database.writer.write { db in
            _ = try activeLedgerRow(ledgerId: ledgerId, db: db)
            try db.execute(
                sql: "DELETE FROM qianlai_ledger_budget_year WHERE ledger_id = ? AND year = ?",
                arguments: [ledgerId, year]
            )
        }
    }

    /// `setExcludedCategories`: deduped ids, each an expense category of
    /// this ledger; the whole-column write never rewrites stored entries.
    func setExcludedCategories(ledgerId: String, accountIds: [String]) async throws {
        let deduped = Array(Set(accountIds))
        try await database.writer.write { db in
            _ = try activeLedgerRow(ledgerId: ledgerId, db: db)
            for id in deduped {
                guard let account = try LocalBookAccountRow.fetchOne(db, key: id),
                      account.ledgerId == ledgerId,
                      account.type == "expense"
                else {
                    throw LocalValidationError(message: "Excluded categories must be expense categories of this ledger")
                }
            }
            var ledger = try activeLedgerRow(ledgerId: ledgerId, db: db)
            ledger.budgetExcludedAccountIds = LocalLedgerRow.build(excludedAccountIds: deduped)
            ledger.updatedAt = LocalValues.timestamp(from: Date())
            try ledger.update(db)
        }
    }

    // MARK: - Category budgets (category-budget.service)

    /// `upsertCategoryBudget`: the category must be an expense of the
    /// ledger; parent and child rows may coexist.
    func upsertCategoryBudget(ledgerId: String, year: Int, accountId: String, cents: Int) async throws {
        try await database.writer.write { db in
            _ = try activeLedgerRow(ledgerId: ledgerId, db: db)
            guard let account = try LocalBookAccountRow.fetchOne(db, key: accountId),
                  account.ledgerId == ledgerId,
                  account.type == "expense"
            else {
                throw LocalValidationError(message: "Budget categories must be expense categories of this ledger")
            }
            let existing = try LocalCategoryBudgetRow
                .filter(Column("ledger_id") == ledgerId
                    && Column("year") == year
                    && Column("account_id") == accountId)
                .fetchOne(db)
            if let existing {
                var row = existing
                row.cents = cents
                try row.update(db)
            } else {
                try LocalCategoryBudgetRow(
                    id: UUID().uuidString, ledgerId: ledgerId,
                    accountId: accountId, year: year, cents: cents
                ).insert(db)
            }
        }
    }

    /// `deleteCategoryBudget`: idempotent removal.
    func deleteCategoryBudget(ledgerId: String, year: Int, accountId: String) async throws {
        try await database.writer.write { db in
            _ = try activeLedgerRow(ledgerId: ledgerId, db: db)
            try db.execute(
                sql: """
                    DELETE FROM qianlai_ledger_category_budget_year
                    WHERE ledger_id = ? AND year = ? AND account_id = ?
                    """,
                arguments: [ledgerId, year, accountId]
            )
        }
    }

    // MARK: - Accounts (account.service)

    /// `createAccount`: any depth, optional icon/meta, optional real-account
    /// link (asset/liability only). Name required.
    @discardableResult
    func createAccount(
        ledgerId: String,
        name: String,
        type: AccountType,
        parentId: String?,
        icon: String?,
        meta: [String: JSONValue]?,
        realAccountId: String?,
        now: Date = Date()
    ) async throws -> BookAccount {
        try await database.writer.write { db in
            _ = try activeLedgerRow(ledgerId: ledgerId, db: db)
            if let parentId {
                guard let parent = try LocalBookAccountRow.fetchOne(db, key: parentId),
                      parent.ledgerId == ledgerId
                else {
                    throw LocalValidationError(message: "Parent account not found in this ledger")
                }
            }
            let typeString = type.rawValue
            if let realAccountId {
                guard type == .asset || type == .liability else {
                    throw LocalValidationError(message: "Only asset and liability accounts can link a real account")
                }
                guard let real = try LocalRealAccountRow.fetchOne(db, key: realAccountId) else {
                    throw LocalValidationError(message: "Real account not found")
                }
                _ = real
            }
            let timestamp = LocalValues.timestamp(from: now)
            let row = LocalBookAccountRow(
                id: UUID().uuidString,
                ledgerId: ledgerId,
                name: name,
                code: nil,
                type: typeString,
                sortOrder: 0,
                parentId: parentId,
                status: "active",
                icon: icon,
                flags: LocalBookAccountRow.build(flags: []),
                meta: LocalValues.jsonObject(meta),
                realAccountId: realAccountId,
                createdAt: timestamp,
                updatedAt: timestamp
            )
            try row.insert(db)
            return row.domainAccount
        }
    }

    /// `updateAccount`: name/icon/meta/status + the real-account link
    /// (explicit nil unlinks).
    func updateAccount(
        ledgerId: String,
        accountId: String,
        name: String?,
        icon: String?,
        meta: [String: JSONValue]?,
        status: String?,
        realAccountId: String?,
        linkRealAccount: Bool,
        now: Date = Date()
    ) async throws {
        try await database.writer.write { db in
            _ = try activeLedgerRow(ledgerId: ledgerId, db: db)
            guard var row = try LocalBookAccountRow.fetchOne(db, key: accountId),
                  row.ledgerId == ledgerId
            else {
                throw LocalValidationError(message: "Account not found")
            }
            if let name { row.name = name }
            if let icon { row.icon = icon }
            if let meta { row.meta = LocalValues.jsonObject(meta) }
            if let status { row.status = status }
            if linkRealAccount {
                if let realAccountId {
                    row.realAccountId = realAccountId
                } else {
                    row.realAccountId = nil
                }
            }
            row.updatedAt = LocalValues.timestamp(from: now)
            try row.update(db)
        }
    }

    /// `reorderAccounts`: same-parent stability (no moves via reorder),
    /// all-or-nothing.
    func reorderAccounts(
        ledgerId: String,
        items: [(id: String, parentId: String?, sortOrder: Int)]
    ) async throws {
        try await database.writer.write { db in
            _ = try activeLedgerRow(ledgerId: ledgerId, db: db)
            var updates: [(LocalBookAccountRow, Int)] = []
            for item in items {
                guard let row = try LocalBookAccountRow.fetchOne(db, key: item.id),
                      row.ledgerId == ledgerId
                else {
                    throw LocalValidationError(message: "Account not found")
                }
                guard row.parentId == item.parentId else {
                    throw LocalValidationError(message: "Cannot move account to a different parent via reorder")
                }
                updates.append((row, item.sortOrder))
            }
            let timestamp = LocalValues.timestamp(from: Date())
            for (row, sortOrder) in updates {
                var updated = row
                updated.sortOrder = sortOrder
                updated.updatedAt = timestamp
                try updated.update(db)
            }
        }
    }

    /// `archiveToggleAccount` (status flip; the delete path's alternative
    /// for accounts with lines).
    func setAccountStatus(ledgerId: String, accountId: String, status: String) async throws {
        try await database.writer.write { db in
            _ = try activeLedgerRow(ledgerId: ledgerId, db: db)
            guard var row = try LocalBookAccountRow.fetchOne(db, key: accountId),
                  row.ledgerId == ledgerId
            else {
                throw LocalValidationError(message: "Account not found")
            }
            row.status = status
            row.updatedAt = LocalValues.timestamp(from: Date())
            try row.update(db)
        }
    }

    /// `deleteAccount`: builtin block, line guard (archive instead), child
    /// guard (children first).
    func deleteAccount(ledgerId: String, accountId: String) async throws {
        try await database.writer.write { db in
            _ = try activeLedgerRow(ledgerId: ledgerId, db: db)
            guard let row = try LocalBookAccountRow.fetchOne(db, key: accountId),
                  row.ledgerId == ledgerId
            else {
                throw LocalValidationError(message: "Account not found")
            }
            let flags = row.flagsList
            if flags.contains(LocalValidation.builtinFlag) {
                throw LocalValidationError(message: "Built-in accounts cannot be deleted")
            }
            let lineCount = try Int.fetchOne(
                db, sql: "SELECT COUNT(*) FROM qianlai_journal_line WHERE account_id = ?",
                arguments: [accountId]
            ) ?? 0
            if lineCount > 0 {
                throw LocalValidationError(message: "This account has journal lines and cannot be deleted; archive it instead")
            }
            let childCount = try Int.fetchOne(
                db, sql: "SELECT COUNT(*) FROM qianlai_book_account WHERE parent_id = ?",
                arguments: [accountId]
            ) ?? 0
            if childCount > 0 {
                throw LocalValidationError(message: "Delete or move this account's children first")
            }
            _ = try LocalBookAccountRow.deleteOne(db, key: accountId)
        }
    }

    // MARK: - Projects (project.service)

    /// `createProject`: the creator joins as the first member.
    @discardableResult
    func createProject(
        ledgerId: String,
        creatorId: String,
        name: String,
        description: String?,
        startDate: Date?,
        endDate: Date?,
        now: Date = Date()
    ) async throws -> String {
        try await database.writer.write { db in
            _ = try activeLedgerRow(ledgerId: ledgerId, db: db)
            let id = UUID().uuidString
            let timestamp = LocalValues.timestamp(from: now)
            try LocalProjectRow(
                id: id,
                ledgerId: ledgerId,
                name: name,
                description: description,
                status: "active",
                startDate: startDate.map { LocalValues.timestamp(from: $0) },
                endDate: endDate.map { LocalValues.timestamp(from: $0) },
                createdAt: timestamp,
                updatedAt: timestamp
            ).insert(db)
            try LocalProjectMemberRow(
                id: UUID().uuidString,
                projectId: id,
                userId: creatorId,
                createdAt: timestamp
            ).insert(db)
            return id
        }
    }

    func updateProject(
        ledgerId: String,
        projectId: String,
        name: String?,
        description: String?,
        status: String?,
        startDate: Date?,
        endDate: Date?,
        now: Date = Date()
    ) async throws {
        try await database.writer.write { db in
            _ = try activeLedgerRow(ledgerId: ledgerId, db: db)
            guard var row = try LocalProjectRow.fetchOne(db, key: projectId),
                  row.ledgerId == ledgerId
            else {
                throw LocalValidationError(message: "Project not found")
            }
            if let name { row.name = name }
            if let description { row.description = description }
            if let status { row.status = status }
            if let startDate { row.startDate = LocalValues.timestamp(from: startDate) }
            if let endDate { row.endDate = LocalValues.timestamp(from: endDate) }
            row.updatedAt = LocalValues.timestamp(from: now)
            try row.update(db)
        }
    }

    /// `deleteProject`: the row cascade wipes members; entries detach
    /// (`SetNull` parity — they survive unassigned).
    func deleteProject(ledgerId: String, projectId: String) async throws {
        try await database.writer.write { db in
            _ = try activeLedgerRow(ledgerId: ledgerId, db: db)
            guard let row = try LocalProjectRow.fetchOne(db, key: projectId),
                  row.ledgerId == ledgerId
            else {
                throw LocalValidationError(message: "Project not found")
            }
            _ = try LocalProjectRow.deleteOne(db, key: projectId)
        }
    }

    /// Adds the project member — locally the roster is the install
    /// identity alone, so the only valid add is re-asserting it.
    func addProjectMember(ledgerId: String, projectId: String, userId: String, now: Date = Date()) async throws {
        try await database.writer.write { db in
            _ = try activeLedgerRow(ledgerId: ledgerId, db: db)
            guard let project = try LocalProjectRow.fetchOne(db, key: projectId),
                  project.ledgerId == ledgerId
            else {
                throw LocalValidationError(message: "Project not found")
            }
            let existing = try LocalProjectMemberRow
                .filter(Column("project_id") == projectId && Column("user_id") == userId)
                .fetchOne(db)
            guard existing == nil else {
                throw LocalValidationError(message: "Already a member of this project")
            }
            try LocalProjectMemberRow(
                id: UUID().uuidString,
                projectId: projectId,
                userId: userId,
                createdAt: LocalValues.timestamp(from: now)
            ).insert(db)
        }
    }

    func removeProjectMember(ledgerId: String, projectId: String, userId: String) async throws {
        try await database.writer.write { db in
            _ = try activeLedgerRow(ledgerId: ledgerId, db: db)
            try db.execute(
                sql: """
                    DELETE FROM qianlai_project_member
                    WHERE project_id = ? AND user_id = ?
                    """,
                arguments: [projectId, userId]
            )
        }
    }

    // MARK: - Real accounts (real-account.service)

    @discardableResult
    func createRealAccount(
        ownerId: String,
        name: String,
        type: AccountType,
        icon: String?,
        meta: [String: JSONValue]?,
        now: Date = Date()
    ) async throws -> String {
        let id = UUID().uuidString
        let timestamp = LocalValues.timestamp(from: now)
        try await database.writer.write { db in
            try LocalRealAccountRow(
                id: id,
                ownerId: ownerId,
                name: name,
                type: type.rawValue,
                status: "active",
                icon: icon,
                meta: LocalValues.jsonObject(meta),
                createdAt: timestamp,
                updatedAt: timestamp
            ).insert(db)
        }
        return id
    }

    func updateRealAccount(
        id: String,
        name: String?,
        status: String?,
        icon: String?,
        meta: [String: JSONValue]?,
        now: Date = Date()
    ) async throws {
        try await database.writer.write { db in
            guard var row = try LocalRealAccountRow.fetchOne(db, key: id) else {
                throw LocalValidationError(message: "Real account not found")
            }
            if let name { row.name = name }
            if let status { row.status = status }
            if let icon { row.icon = icon }
            if let meta { row.meta = LocalValues.jsonObject(meta) }
            row.updatedAt = LocalValues.timestamp(from: now)
            try row.update(db)
        }
    }

    /// Deleting a real account unlinks its pockets (`SetNull` parity).
    func deleteRealAccount(id: String) async throws {
        try await database.writer.write { db in
            guard let row = try LocalRealAccountRow.fetchOne(db, key: id) else {
                throw LocalValidationError(message: "Real account not found")
            }
            try db.execute(
                sql: "UPDATE qianlai_book_account SET real_account_id = NULL WHERE real_account_id = ?",
                arguments: [row.id]
            )
            _ = try LocalRealAccountRow.deleteOne(db, key: id)
        }
    }
}
