//
//  LocalJournalRepository.swift
//  Qianlai
//

import Foundation
import GRDB

/// The journal list's filter surface, mirroring the store's `Filters` and
/// the server's `EntryWindow` one to one — the local list/summary queries
/// reduce through the same axis set so a local page renders exactly what
/// the cloud page renders for the same data.
nonisolated struct LocalJournalFilter {
    var q: String = ""
    var from: Date?
    var to: Date?
    var participantUserId: String?
    var projectId: String?
    var accountId: String?
    /// Top-level rollup drill-down: entries against this parent OR any
    /// child under it.
    var parentAccountId: String?
    var accountType: AccountType?
    /// Settlement drill-down: payer, tagged participant, or untagged while
    /// a member of the entry's project (the server's memberUserId clause).
    var memberUserId: String?
    var kind: QuickEntryKind?
    /// The budget-flag drill axis; nil keeps every entry.
    var budgetExcluded: Bool?
    /// The countsInLedger drill axis; nil keeps every entry.
    var countsInLedger: Bool?
    /// The set-wide escape hatch — true (default) lists opted-out entries
    /// too, false applies the ledger-activity predicate. Project-scoped
    /// queries always list everything (the predicate never applies).
    var includeExcluded: Bool = true

    static let unfiltered = LocalJournalFilter()
}

/// List ordering — the server's date (default, newest-first) and amount
/// (gross debit sum) modes, each direction, date always secondary.
nonisolated enum LocalJournalSort {
    case dateNewestFirst
    case dateOldestFirst
    case amountDescending
    case amountAscending
}

/// Journal reads over the local store (T1.6): the filtered list with
/// pagination and totals, the extent bounds, the daily summary, and the
/// recent-activity feed. Every query mirrors the server's
/// `entryFilterWhere` predicate set (the comment on each axis names the
/// clause it mirrors); rows map to the SAME domain structs the cloud API
/// returns, so stores can switch sources without a view knowing.
nonisolated final class LocalJournalRepository {
    let database: LocalDatabase

    init(database: LocalDatabase) {
        self.database = database
    }

    // MARK: - List

    /// One page of the filtered list plus its unpaginated total — the
    /// entries endpoint's exact contract.
    func entries(
        ledgerId: String,
        filter: LocalJournalFilter,
        sort: LocalJournalSort,
        limit: Int,
        offset: Int
    ) async throws -> (entries: [JournalEntry], total: Int) {
        try await database.writer.read { db in
            let whereSql = Self.whereSql(filter: filter, ledgerId: ledgerId, db: db)
            let orderSql = Self.orderSql(sort: sort)
            let rows = try LocalJournalEntryRow.fetchAll(
                db,
                sql: """
                    SELECT e.* FROM qianlai_journal_entry e
                    WHERE \(whereSql)
                    \(orderSql)
                    LIMIT ? OFFSET ?
                    """,
                arguments: [limit, offset]
            )
            let total = try Int.fetchOne(
                db,
                sql: """
                    SELECT COUNT(*) FROM qianlai_journal_entry e
                    WHERE \(whereSql)
                    """
            ) ?? 0
            let entries = try assemble(rows, ledgerId: ledgerId, db: db)
            return (entries, total)
        }
    }

    /// Every entry under the filter — the share-based aggregations' input
    /// (they reduce whole sets, never pages). Ordered newest-first for
    /// stable downstream behavior.
    func allEntries(
        ledgerId: String,
        filter: LocalJournalFilter
    ) async throws -> [JournalEntry] {
        try await database.writer.read { db in
            let rows = try LocalJournalEntryRow.fetchAll(
                db,
                sql: """
                    SELECT e.* FROM qianlai_journal_entry e
                    WHERE \(Self.whereSql(filter: filter, ledgerId: ledgerId, db: db))
                    \(Self.orderSql(sort: .dateNewestFirst))
                    """,
                arguments: []
            )
            return try assemble(rows, ledgerId: ledgerId, db: db)
        }
    }

    /// The entries date extent under the filter minus the date window and
    /// the text query (the extent describes what the ledger contains) —
    /// the oldest and newest instants, or nil when nothing matches.
    func bounds(ledgerId: String, filter: LocalJournalFilter) async throws -> EntryDateBounds? {
        var scoped = filter
        scoped.from = nil
        scoped.to = nil
        scoped.q = ""
        return try await database.writer.read { db in
            let whereSql = Self.whereSql(filter: scoped, ledgerId: ledgerId)
            let oldest = try String.fetchOne(
                db,
                sql: "SELECT date FROM qianlai_journal_entry e WHERE \(whereSql) ORDER BY e.date ASC, e.entry_no ASC LIMIT 1"
            )
            let newest = try String.fetchOne(
                db,
                sql: "SELECT date FROM qianlai_journal_entry e WHERE \(whereSql) ORDER BY e.date DESC, e.entry_no DESC LIMIT 1"
            )
            guard let oldest, let newest,
                  let earliest = LocalValues.date(fromTimestamp: oldest),
                  let latest = LocalValues.date(fromTimestamp: newest)
            else { return nil }
            return EntryDateBounds(earliest: earliest, latest: latest)
        }
    }

    /// The 5 most recent entries of the filtered set, all-time — the
    /// recent-activity feed (`listRecent`): the filter minus the date
    /// bounds, the activity predicate never applied beyond the filter's
    /// own settings.
    func recent(
        ledgerId: String,
        filter: LocalJournalFilter,
        limit: Int
    ) async throws -> [JournalEntry] {
        var scoped = filter
        scoped.from = nil
        scoped.to = nil
        return try await database.writer.read { db in
            let rows = try LocalJournalEntryRow.fetchAll(
                db,
                sql: """
                    SELECT e.* FROM qianlai_journal_entry e
                    WHERE \(Self.whereSql(filter: scoped, ledgerId: ledgerId, db: db))
                    ORDER BY e.date DESC, e.entry_no DESC
                    LIMIT ?
                    """,
                arguments: [limit]
            )
            return try assemble(rows, ledgerId: ledgerId, db: db)
        }
    }

    // MARK: - SQL predicates

    /// The AND-composed where clause, clause by clause the server's
    /// `entryFilterWhere`. Text comparisons ride the fixed-width UTC
    /// timestamp encoding (lexicographic == chronological). With a
    /// database handle, a text query widens over the ledger's accounts'
    /// localized labels — the label-matched codes the server's search
    /// translates (seeded categories store no name, so searching the
    /// localized label must search their codes).
    static func whereSql(filter: LocalJournalFilter, ledgerId: String, db: Database? = nil) -> String {
        var clauses: [String] = ["e.ledger_id = '\(escape(ledgerId))'"]

        // The ledger-activity predicate: applies only when the set-wide
        // escape hatch is off and the query isn't project-scoped or
        // countsInLedger-axis-scoped (the server's lift rules).
        let projectScoped = filter.projectId != nil
        let activityLifted = filter.countsInLedger != nil || projectScoped || filter.includeExcluded
        if !activityLifted {
            clauses.append("(e.guest_created = 1 OR e.counts_in_ledger = 1)")
        }
        if let budgetExcluded = filter.budgetExcluded {
            clauses.append("e.excluded_from_budget = \(budgetExcluded ? 1 : 0)")
        }
        if let countsInLedger = filter.countsInLedger {
            clauses.append("e.counts_in_ledger = \(countsInLedger ? 1 : 0)")
        }
        if let from = filter.from {
            clauses.append("e.date >= '\(escape(LocalValues.timestamp(from: from)))'")
        }
        if let to = filter.to {
            clauses.append("e.date <= '\(escape(LocalValues.timestamp(from: to)))'")
        }
        if let projectId = filter.projectId {
            clauses.append("e.project_id = '\(escape(projectId))'")
        }
        // Line-joined axes: accountId, parentAccountId (parent itself plus
        // children), accountType — one EXISTS each, AND-composed.
        var lineConditions: [String] = []
        if let accountId = filter.accountId {
            lineConditions.append("l.account_id = '\(escape(accountId))'")
        }
        if let parentId = filter.parentAccountId {
            lineConditions.append(
                "(l.account_id = '\(escape(parentId))' OR EXISTS (SELECT 1 FROM qianlai_book_account pa WHERE pa.id = l.account_id AND pa.parent_id = '\(escape(parentId))'))"
            )
        }
        if let type = filter.accountType {
            lineConditions.append("EXISTS (SELECT 1 FROM qianlai_book_account ta WHERE ta.id = l.account_id AND ta.type = '\(escape(type.rawValue))')")
        }
        if !lineConditions.isEmpty {
            clauses.append("EXISTS (SELECT 1 FROM qianlai_journal_line l WHERE l.entry_id = e.id AND (\(lineConditions.joined(separator: " AND "))))")
        }
        if let kind = filter.kind {
            switch kind {
            case .expense:
                clauses.append(kindLinesClause(type: "expense"))
            case .income:
                clauses.append(kindLinesClause(type: "income"))
            case .transfer:
                clauses.append("NOT ((\(kindLinesClause(type: "expense"))) OR (\(kindLinesClause(type: "income"))))")
            }
        }
        if let memberUserId = filter.memberUserId {
            let id = escape(memberUserId)
            // Payer, tagged participant, or untagged while a member of the
            // entry's project — creation alone never matches.
            clauses.append(
                """
                (
                    e.paid_by_id = '\(id)'
                    OR EXISTS (SELECT 1 FROM qianlai_journal_entry_participant p WHERE p.entry_id = e.id AND p.user_id = '\(id)')
                    OR (
                        NOT EXISTS (SELECT 1 FROM qianlai_journal_entry_participant p WHERE p.entry_id = e.id)
                        AND e.project_id IS NOT NULL
                        AND EXISTS (SELECT 1 FROM qianlai_project_member pm WHERE pm.project_id = e.project_id AND pm.user_id = '\(id)')
                    )
                )
                """
            )
        }
        if let participantUserId = filter.participantUserId {
            clauses.append(
                "EXISTS (SELECT 1 FROM qianlai_journal_entry_participant p WHERE p.entry_id = e.id AND p.user_id = '\(escape(participantUserId))')"
            )
        }
        // The search OR (memo/address/addressName/merchant/line memo/
        // account name+code) — contains semantics via LIKE; the localized
        // labels of seeded categories widen the search with their codes
        // (the server's accountCodesMatchingLabel translation), resolved
        // against the ledger's accounts when a handle is supplied.
        if !filter.q.isEmpty {
            let pattern = "%\(escapeLike(filter.q.trimmingCharacters(in: .whitespacesAndNewlines)))%"
            let columns = ["e.memo", "e.address", "e.address_name", "e.merchant"]
            var ors = columns.map { "\($0) LIKE '\(pattern)' ESCAPE '\\' COLLATE NOCASE" }
            ors.append(
                """
                EXISTS (
                    SELECT 1 FROM qianlai_journal_line l
                    LEFT JOIN qianlai_book_account a ON a.id = l.account_id
                    WHERE l.entry_id = e.id
                      AND (l.memo LIKE '\(pattern)' ESCAPE '\\' COLLATE NOCASE
                           OR a.name LIKE '\(pattern)' ESCAPE '\\' COLLATE NOCASE
                           OR a.code LIKE '\(pattern)' ESCAPE '\\' COLLATE NOCASE)
                )
                """
            )
            if let db {
                let codes = Self.labelMatchedCodesFromDb(query: filter.q, ledgerId: ledgerId, db: db)
                if !codes.isEmpty {
                    let idList = codes.map { "'\(escape($0))'" }.joined(separator: ",")
                    ors.append(
                        """
                        EXISTS (
                            SELECT 1 FROM qianlai_journal_line l
                            JOIN qianlai_book_account a ON a.id = l.account_id
                            WHERE l.entry_id = e.id AND a.code IN (\(idList))
                        )
                        """
                    )
                }
            }
            clauses.append("(\(ors.joined(separator: " OR ")))")
        }
        return clauses.joined(separator: " AND ")
    }

    /// The ledger's accounts' localized labels translated to codes for one
    /// query — the read-side twin of `labelMatchedCodes(query:accounts:)`
    /// kept as the single call the WHERE builder makes.
    private static func labelMatchedCodesFromDb(query: String, ledgerId: String, db: Database) -> [String] {
        guard let rows = try? LocalBookAccountRow.fetchAll(
            db, sql: "SELECT * FROM qianlai_book_account WHERE ledger_id = ? AND code IS NOT NULL",
            arguments: [ledgerId]
        ) else { return [] }
        let accounts = rows.map { row in
            BookAccount(
                id: row.id, ledgerId: row.ledgerId, name: row.name, code: row.code,
                type: AccountType(rawValue: row.type) ?? .expense, sortOrder: row.sortOrder,
                parentId: row.parentId, status: row.status, icon: row.icon,
                flags: nil, meta: nil, createdAt: .distantPast
            )
        }
        return labelMatchedCodes(query: query, accounts: accounts)
    }

    /// The kind axis's EXISTS clause for one account type.
    private static func kindLinesClause(type: String) -> String {
        "EXISTS (SELECT 1 FROM qianlai_journal_line l JOIN qianlai_book_account a ON a.id = l.account_id WHERE l.entry_id = e.id AND a.type = '\(type)')"
    }

    /// A localized-label search hit translated into account codes — the
    /// server's `accountCodesMatchingLabel` client-side twin: seeded
    /// categories carry no stored name (the label renders from `code`),
    /// so a query hitting the localized label must search by code. The
    /// caller passes the ledger's accounts (it already holds them).
    static func labelMatchedCodes(query: String, accounts: [BookAccount]) -> [String] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }
        let lowered = trimmed.lowercased()
        var codes: [String] = []
        for account in accounts {
            guard let code = account.code, !codes.contains(code) else { continue }
            let label = L10n.string("account.name.\(code)", defaultValue: code).lowercased()
            if label.contains(lowered) {
                codes.append(code)
            }
        }
        return codes
    }

    /// ORDER BY fragment per sort mode. Amount sorts ride a gross-debit
    /// subquery so offset pagination stays consistent (the server's
    /// reason too); date always breaks ties.
    static func orderSql(sort: LocalJournalSort) -> String {
        switch sort {
        case .dateNewestFirst:
            return "ORDER BY e.date DESC, e.entry_no DESC"
        case .dateOldestFirst:
            return "ORDER BY e.date ASC, e.entry_no ASC"
        case .amountDescending:
            return """
                ORDER BY (SELECT COALESCE(SUM(l.debit_cents), 0) FROM qianlai_journal_line l WHERE l.entry_id = e.id) DESC,
                         e.date DESC, e.entry_no DESC
                """
        case .amountAscending:
            return """
                ORDER BY (SELECT COALESCE(SUM(l.debit_cents), 0) FROM qianlai_journal_line l WHERE l.entry_id = e.id) ASC,
                         e.date DESC, e.entry_no DESC
                """
        }
    }

    static func escape(_ value: String) -> String {
        value.replacingOccurrences(of: "'", with: "''")
    }

    static func escapeLike(_ value: String) -> String {
        value
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "%", with: "\\%")
            .replacingOccurrences(of: "_", with: "\\_")
    }

    // MARK: - Assembly

    /// Rows → domain `JournalEntry`s with lines (account refs one parent
    /// level deep), participants, project ref, location, and the list
    /// endpoint's `memberSharesCents` attachment. Local creator/payer/
    /// participant ids render through the local identity's ref.
    func assemble(
        _ rows: [LocalJournalEntryRow],
        ledgerId: String,
        db: Database
    ) throws -> [JournalEntry] {
        guard !rows.isEmpty else { return [] }
        let ids = rows.map(\.id)
        let placeholders = ids.map { _ in "?" }.joined(separator: ",")
        let lineRows = try LocalJournalLineRowfetchAll(db, entryIds: ids, placeholders: placeholders)
        let participantRows = try LocalEntryParticipantRow.fetchAll(
            db,
            sql: "SELECT * FROM qianlai_journal_entry_participant WHERE entry_id IN (\(placeholders)) ORDER BY created_at ASC, id ASC",
            arguments: StatementArguments(ids)
        )
        let accountRows = try LocalBookAccountRow.fetchAll(
            db, sql: "SELECT * FROM qianlai_book_account WHERE ledger_id = ?", arguments: [ledgerId]
        )
        let accountById = Dictionary(accountRows.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let projectIds = rows.compactMap(\.projectId)
        let projectsById: [String: LocalProjectRow] = projectIds.isEmpty
            ? [:]
            : Dictionary(
                uniqueKeysWithValues: try LocalProjectRow.fetchAll(
                    db,
                    sql: "SELECT * FROM qianlai_project WHERE id IN (\(projectIds.map { _ in "?" }.joined(separator: ",")))",
                    arguments: StatementArguments(projectIds)
                ).map { ($0.id, $0) }
            )
        let memberUserIds = try Set(String.fetchAll(
            db, sql: "SELECT user_id FROM qianlai_ledger_member WHERE ledger_id = ?", arguments: [ledgerId]
        ))

        let linesByEntry = Dictionary(grouping: lineRows, by: \.entryId)
        let participantsByEntry = Dictionary(grouping: participantRows, by: \.entryId)

        return rows.map { row in
            let lines = (linesByEntry[row.id] ?? []).map { line -> JournalLine in
                let accountRow = accountById[line.accountId]
                let parent = accountRow?.parentId.flatMap { accountById[$0] }
                return JournalLine(
                    id: line.id,
                    accountId: line.accountId,
                    account: JournalLineAccountRef(
                        id: line.accountId,
                        name: accountRow?.name,
                        code: accountRow?.code,
                        type: AccountType(rawValue: accountRow?.type ?? "expense") ?? .expense,
                        sortOrder: accountRow?.sortOrder ?? 0,
                        icon: accountRow?.icon,
                        flags: accountRow?.flagsList,
                        parent: parent.map {
                            JournalLineAccountParentRef(
                                id: $0.id, name: $0.name, code: $0.code, icon: $0.icon
                            )
                        }
                    ),
                    debit: LocalValues.yuan(fromCents: line.debitCents),
                    credit: LocalValues.yuan(fromCents: line.creditCents),
                    memo: line.memo
                )
            }
            let participants = (participantsByEntry[row.id] ?? []).map { participant in
                EntryParticipant(id: participant.id, userId: participant.userId, user: LocalIdentity.userRef(id: participant.userId))
            }
            let projectRef = row.projectId.flatMap { id in
                projectsById[id].map {
                    EntryProjectRef(id: $0.id, name: $0.name, status: $0.status)
                }
            }
            var location: EntryLocationRef? = nil
            if row.address != nil || row.addressName != nil || row.latitude != nil || row.longitude != nil {
                location = EntryLocationRef(
                    address: row.address,
                    addressName: row.addressName,
                    latitude: row.latitude,
                    longitude: row.longitude
                )
            }
            let entry = JournalEntry(
                id: row.id,
                ledgerId: row.ledgerId,
                entryNo: row.entryNo,
                date: LocalValues.date(fromTimestamp: row.date) ?? .distantPast,
                memo: row.memo,
                status: row.status,
                countsInLedger: row.countsInLedger,
                guestCreated: row.guestCreated,
                excludedFromBudget: row.excludedFromBudget,
                createdById: row.createdById,
                createdBy: row.createdById.map { LocalIdentity.userRef(id: $0) },
                paidById: row.paidById,
                paidBy: row.paidById.map { LocalIdentity.userRef(id: $0) },
                createdAt: LocalValues.date(fromTimestamp: row.createdAt) ?? .distantPast,
                projectId: row.projectId,
                project: projectRef,
                location: location,
                merchant: row.merchant,
                attachments: nil,
                lines: lines,
                participants: participants,
                memberSharesCents: LocalAggregation.memberSharesCents(
                    lines: lines,
                    participantUserIds: participants.map(\.userId),
                    paidById: row.paidById,
                    memberUserIds: memberUserIds
                )
            )
            return entry
        }
    }
}

/// Entry-line fetch by id list (split out so the assembly stays readable;
/// same fixed-width id binds as the other IN lists).
private func LocalJournalLineRowfetchAll(
    _ db: Database,
    entryIds: [String],
    placeholders: String
) throws -> [LocalJournalLineRow] {
    try LocalJournalLineRow.fetchAll(
        db,
        sql: "SELECT * FROM qianlai_journal_line WHERE entry_id IN (\(placeholders)) ORDER BY rowid ASC",
        arguments: StatementArguments(entryIds)
    )
}
