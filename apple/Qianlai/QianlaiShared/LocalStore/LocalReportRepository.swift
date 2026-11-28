//
//  LocalReportRepository.swift
//  Qianlai
//

import Foundation
import GRDB

/// Local report reads (T1.6): the dashboard, trial balance, income
/// statement, member turnover, daily/category summaries, budget and
/// category-budget reports, and the project report — every aggregation
/// reduced through `LocalAggregation`, the line-by-line mirror of the
/// server's report/budget/category-budget/project services. The read-side
/// contract: same filters in, same payload out, byte-for-byte figures.
///
/// Entry-set scoping per surface (the server's exact rules):
/// - stats/dashboard/statement activity set → the ledger-activity
///   predicate (`guestCreated OR countsInLedger`), lifted by the axis
///   and project rules `LocalJournalFilter` already encodes;
/// - trial balance, budget pools, settlement → every entry (accounting
///   truth); the budget flag independence lives in the aggregation;
/// - the personal income statement → the viewer's own share subset
///   (`listShareEntries`' OR, mirrored in `shareEntryWhere`).
nonisolated final class LocalReportRepository {
    let database: LocalDatabase
    private let journal: LocalJournalRepository

    init(database: LocalDatabase) {
        self.database = database
        self.journal = LocalJournalRepository(database: database)
    }

    // MARK: - Dashboard

    /// Net worth (accounting-true, all-time) + the window's behavioral
    /// statement + the recent feed — `report.service.dashboard` with the
    /// caller-owned window (the client always sends explicit from/to).
    /// The month label comes from `from`'s UTC date parts, the same
    /// server quirk `WidgetSnapshot` documents (a from instant east of
    /// UTC labels the previous month — clients key snapshots off the
    /// requested month, never this label).
    func dashboard(
        ledgerId: String,
        from: Date?,
        to: Date?,
        filter: LocalJournalFilter,
        shareMode: LocalReportShareMode,
        viewerUserId: String
    ) async throws -> Dashboard {
        let accounts = try await accounts(ledgerId: ledgerId)

        // Net worth: per-account all-time sums, asset debit-net summed,
        // liability credit-net summed.
        let allTimeSums = try await sumLinesByAccountCents(
            ledgerId: ledgerId, from: nil, to: nil
        )
        var assetsCents = 0
        var liabilitiesCents = 0
        for account in accounts where account.type == .asset || account.type == .liability {
            let sums = allTimeSums[account.id] ?? (0, 0)
            if account.type == .asset {
                assetsCents += sums.debit - sums.credit
            } else {
                liabilitiesCents += sums.credit - sums.debit
            }
        }

        // Behavioral statement over the bounded window (the same entry set
        // the summaries use — activity predicate, filters, guest clamping).
        // Stats speak the activity set (includeExcluded=false), the route
        // default the server applies.
        var windowFilter = filter
        windowFilter.from = from
        windowFilter.to = to
        windowFilter.includeExcluded = false
        let monthEntries = try await journal.allEntries(ledgerId: ledgerId, filter: windowFilter)
        let memberUserIds = try await ledgerMemberUserIds(ledgerId: ledgerId)
        let statement = LocalAggregation.buildStatementRows(
            accounts: accounts,
            sumsCents: statementSumsCents(
                entries: monthEntries, shareMode: shareMode,
                memberUserIds: memberUserIds, viewerUserId: viewerUserId
            )
        )

        // Recent feed: the filters minus the date bounds, five rows.
        let recent = try await journal.recent(ledgerId: ledgerId, filter: filter, limit: 5)

        // The month label: `from`'s UTC parts, or the current UTC month
        // when absent — the server's exact fallback.
        let monthStart = from ?? Date()
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
        let parts = calendar.dateComponents([.year, .month], from: monthStart)
        let yuan: (Int) -> Double = { LocalValues.yuan(fromCents: $0) }
        return Dashboard(
            assets: yuan(assetsCents),
            liabilities: yuan(liabilitiesCents),
            netWorth: yuan(assetsCents - liabilitiesCents),
            month: DashboardMonth(
                year: parts.year ?? 1970,
                month: parts.month ?? 1,
                income: statement.income,
                expense: statement.expense,
                totalIncome: statement.totalIncome,
                totalExpense: statement.totalExpense,
                net: statement.net
            ),
            recentEntries: recent
        )
    }

    /// The one-shot windowed summary (the journal stat card) — dashboard
    /// shape over an explicit window and the journal's structural filters,
    /// with nothing touching published state.
    func windowSummary(
        ledgerId: String,
        from: Date,
        to: Date,
        filter: LocalJournalFilter,
        viewerUserId: String
    ) async throws -> Dashboard {
        try await dashboard(
            ledgerId: ledgerId, from: from, to: to,
            filter: filter, shareMode: filterShareMode(filter),
            viewerUserId: viewerUserId
        )
    }

    // MARK: - Trial balance

    /// Every account's gross debit/credit in the window (accounting truth:
    /// no activity predicate, no flags dropped) — `report.service.trialBalance`.
    func trialBalance(ledgerId: String, from: Date?, to: Date?) async throws -> TrialBalance {
        let accounts = try await accounts(ledgerId: ledgerId)
        let sums = try await sumLinesByAccountCents(ledgerId: ledgerId, from: from, to: to)
        let rows = accounts.map { account -> TrialBalanceRow in
            let sums = sums[account.id] ?? (0, 0)
            return TrialBalanceRow(
                id: account.id,
                name: account.name,
                code: account.code,
                type: account.type,
                sortOrder: account.sortOrder,
                totalDebit: LocalValues.yuan(fromCents: sums.debit),
                totalCredit: LocalValues.yuan(fromCents: sums.credit),
                balance: LocalAggregation.signedBalance(
                    type: account.type, debitCents: sums.debit, creditCents: sums.credit
                )
            )
        }
        let totalDebit = Int((rows.reduce(0) { $0 + $1.totalDebit * 100 }).rounded())
        let totalCredit = Int((rows.reduce(0) { $0 + $1.totalCredit * 100 }).rounded())
        return TrialBalance(
            accounts: rows,
            totals: TrialBalanceTotals(
                debit: LocalValues.yuan(fromCents: totalDebit),
                credit: LocalValues.yuan(fromCents: totalCredit)
            )
        )
    }

    // MARK: - Income statement

    /// The share-based ledger P&L (`incomeStatement`): the viewer's share
    /// subset in the window, attributed per the split math.
    func incomeStatement(
        ledgerId: String,
        from: Date?,
        to: Date?,
        viewerUserId: String
    ) async throws -> IncomeStatement {
        let accounts = try await accounts(ledgerId: ledgerId)
        let entries = try await shareEntries(
            ledgerId: ledgerId, viewerUserId: viewerUserId, from: from, to: to
        )
        let sums = LocalAggregation.shareSumsByAccountCents(entries) { entry in
            LocalAggregation.viewerShareCents(
                lines: entry.lines,
                participantUserIds: (entry.participants ?? []).map(\.userId),
                paidById: entry.paidById,
                viewerUserId: viewerUserId
            )
        }
        return LocalAggregation.buildStatementRows(accounts: accounts, sumsCents: sums)
    }

    /// `listShareEntries`' OR, mirrored: project entries the viewer
    /// participates in unless they paid a countsInLedger=false entry;
    /// untagged entries the viewer paid that count in.
    private func shareEntries(
        ledgerId: String, viewerUserId: String, from: Date?, to: Date?
    ) async throws -> [JournalEntry] {
        let id = LocalJournalRepository.escape(viewerUserId)
        let whereSql = """
            e.ledger_id = '\(LocalJournalRepository.escape(ledgerId))'
            \(dateClause(from: from, to: to))
            AND (
                (
                    e.project_id IS NOT NULL
                    AND EXISTS (SELECT 1 FROM qianlai_journal_entry_participant p WHERE p.entry_id = e.id AND p.user_id = '\(id)')
                    AND NOT (e.paid_by_id = '\(id)' AND e.counts_in_ledger = 0)
                )
                OR
                (
                    e.project_id IS NULL
                    AND e.paid_by_id = '\(id)'
                    AND e.counts_in_ledger = 1
                )
            )
            """
        return try await entriesByWhere(whereSql: whereSql, arguments: [], ledgerId: ledgerId)
    }

    // MARK: - Member turnover

    /// Gross turnover per tagged user (`memberTurnover`): every entry with
    /// participants in the window counts in full for each of its tagged
    /// users; current members with no tags are omitted; departed users
    /// keep their rows.
    func memberTurnover(ledgerId: String, from: Date?, to: Date?) async throws -> MemberTurnover {
        let entries = try await entriesByWhere(
            whereSql: """
                e.ledger_id = '\(LocalJournalRepository.escape(ledgerId))'
                \(dateClause(from: from, to: to))
                AND EXISTS (SELECT 1 FROM qianlai_journal_entry_participant p WHERE p.entry_id = e.id)
                """,
            arguments: [],
            ledgerId: ledgerId
        )
        let (memberRows, memberByUserId) = try await ledgerMembers(ledgerId: ledgerId)
        var order: [String] = []
        var aggregates: [String: (turnover: Double, entries: Int)] = [:]
        for entry in entries {
            let gross = entry.lines.reduce(0) { $0 + $1.debit }
            for participant in entry.participants ?? [] {
                if aggregates[participant.userId] == nil {
                    order.append(participant.userId)
                    aggregates[participant.userId] = (0, 0)
                }
                aggregates[participant.userId]?.turnover += gross
                aggregates[participant.userId]?.entries += 1
            }
        }
        let rows = order.map { userId -> MemberTurnoverRow in
            let aggregate = aggregates[userId] ?? (0, 0)
            let member = memberByUserId[userId]
            let fallbackName = userId
            return MemberTurnoverRow(
                userId: userId,
                ledgerMemberId: member?.id,
                name: member.map { memberRow in
                    // The local member is the install identity — render
                    // its display label; any other id (post-remap residue)
                    // falls back to the raw id.
                    memberRow.userId == LocalIdentity.userId
                        ? LocalIdentity.displayName
                        : userId
                } ?? fallbackName,
                avatar: nil,
                role: member.map { LedgerRole(rawValue: $0.role) ?? .guest } ?? .guest,
                entryCount: aggregate.entries,
                turnover: (aggregate.turnover * 100).rounded() / 100
            )
        }
        let totalEntries = entries.count
        let totalTurnover = Int((rows.reduce(0) { $0 + $1.turnover * 100 }).rounded())
        return MemberTurnover(
            members: rows,
            totals: MemberTurnoverTotals(
                entries: totalEntries,
                turnover: LocalValues.yuan(fromCents: totalTurnover)
            )
        )
    }

    // MARK: - Daily & category summaries

    /// The daily summary per share mode — the trend/calendar/header
    /// figures. Days bucket by the stored day key's rule (`localDayKey`).
    func dailySummary(
        ledgerId: String,
        filter: LocalJournalFilter,
        shareMode: LocalReportShareMode,
        tzOffsetMinutes: Int
    ) async throws -> [DayIncomeExpense] {
        let entries = try await activityEntries(ledgerId: ledgerId, filter: filter)
        switch shareMode {
        case .members:
            let memberUserIds = try await ledgerMemberUserIds(ledgerId: ledgerId)
            return LocalAggregation.memberShareDailySummary(
                entries, memberUserIds: memberUserIds, tzOffsetMinutes: tzOffsetMinutes
            )
        case .line:
            return LocalAggregation.dailySummaryFromLines(entries, tzOffsetMinutes: tzOffsetMinutes)
        }
    }

    /// The category summary per share mode — the composition chart.
    func categorySummary(
        ledgerId: String,
        filter: LocalJournalFilter,
        shareMode: LocalReportShareMode
    ) async throws -> CategorySummaryResponse {
        let entries = try await activityEntries(ledgerId: ledgerId, filter: filter)
        switch shareMode {
        case .members:
            let memberUserIds = try await ledgerMemberUserIds(ledgerId: ledgerId)
            return LocalAggregation.memberShareCategorySummary(entries, memberUserIds: memberUserIds)
        case .line:
            return LocalAggregation.lineCategorySummary(entries)
        }
    }

    // MARK: - Budget report

    /// The budget card's payload (`buildBudgetReport`): the anchor month's
    /// pools + the year-to-date table, over ALL entries (the two counting
    /// flags are independent — no activity predicate here).
    func budgetReport(
        ledgerId: String, year: Int, month: Int, tzOffsetMinutes: Int
    ) async throws -> BudgetReport {
        let ledger = try await ledgerRow(ledgerId: ledgerId)
        let anchor = LocalAggregation.monthWindow(year: year, month: month, tzOffsetMinutes: tzOffsetMinutes)
        let yearFrom = LocalAggregation.monthWindow(year: year, month: 1, tzOffsetMinutes: tzOffsetMinutes).from

        let yearRow = try await budgetYearRow(ledgerId: ledgerId, year: year)
        let overrides = try await budgetOverrides(budgetYearId: yearRow?.id)
        let activityEntries = try await journal.allEntries(
            ledgerId: ledgerId,
            filter: LocalJournalFilter(from: yearFrom, to: anchor.to)
        )
        let activity = LocalAggregation.toBudgetActivityRows(activityEntries)
        let aggregates = LocalAggregation.aggregateBudgetMonths(activity, tzOffsetMinutes: tzOffsetMinutes, anchorYear: year)
        let yearCents = yearRow?.cents
        let anchorAggregate = aggregates[month]

        return BudgetReport(
            budgetCents: yearCents,
            currency: ledger?.currency ?? "CNY",
            excludedAccountIds: ledger?.budgetExcludedAccountIdsList() ?? [],
            month: yearCents == nil ? nil : BudgetMonthSummary(
                year: year,
                month: month,
                budgetCents: LocalAggregation.resolveMonthBudgetCents(yearCents: yearCents, overrides: overrides, month: month) ?? yearCents ?? 0,
                countedCents: anchorAggregate?.countedCents ?? 0,
                excludedCents: anchorAggregate?.excludedCents ?? 0
            ),
            year: yearCents == nil ? nil : LocalAggregation.buildBudgetYear(
                activity: activity,
                yearCents: yearCents,
                overrides: overrides,
                anchorYear: year,
                anchorMonth: month,
                tzOffsetMinutes: tzOffsetMinutes
            )
        )
    }

    /// The category budget card (`categoryBudgetReport`): the year's pins
    /// plus the previous year's prefill, spent = subtree total over every
    /// recorded expense cent in the year window (both opt-out flags stay).
    func categoryBudgetReport(ledgerId: String, year: Int) async throws -> CategoryBudgetReport {
        let ledger = try await ledgerRow(ledgerId: ledgerId)
        let accounts = try await accounts(ledgerId: ledgerId)
        let budgetRows = try await database.writer.read { db in
            try LocalCategoryBudgetRow
                .filter(Column("ledger_id") == ledgerId
                    && Column("year") == year)
                .order(Column("account_id"))
                .fetchAll(db)
        }
        let previousRows = try await database.writer.read { db in
            try LocalCategoryBudgetRow
                .filter(Column("ledger_id") == ledgerId
                    && Column("year") == year - 1)
                .order(Column("account_id"))
                .fetchAll(db)
        }
        // Year window from the tz contract; spent sums every expense cent.
        let tz = AppDates.localTzOffsetMinutes
        let yearFrom = LocalAggregation.monthWindow(year: year, month: 1, tzOffsetMinutes: tz).from
        let yearTo = LocalAggregation.monthWindow(year: year, month: 12, tzOffsetMinutes: tz).to
        var windowFilter = LocalJournalFilter(from: yearFrom, to: yearTo)
        windowFilter.accountType = .expense
        windowFilter.includeExcluded = true
        let entries = try await journal.allEntries(ledgerId: ledgerId, filter: windowFilter)
        var sumsByAccountId: [String: Int] = [:]
        for entry in entries {
            for line in entry.lines where line.account.type == .expense {
                sumsByAccountId[line.accountId, default: 0] += Int((line.debit * 100).rounded())
                    - Int((line.credit * 100).rounded())
            }
        }
        let rollup = LocalAggregation.rollUpCategorySums(
            accounts: accounts, sumsByAccountId: sumsByAccountId,
            budgetAccountIds: budgetRows.map(\.accountId)
        )
        let spentByAccountId = Dictionary(rollup.map { ($0.accountId, $0.spentCents) }, uniquingKeysWith: { first, _ in first })
        let accountById = Dictionary(accounts.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let rows = budgetRows.map { row -> CategoryBudgetRow in
            let account = accountById[row.accountId]
            return CategoryBudgetRow(
                accountId: row.accountId,
                name: account?.name,
                code: account?.code,
                icon: account?.icon,
                budgetCents: row.cents,
                spentCents: spentByAccountId[row.accountId] ?? 0
            )
        }
        return CategoryBudgetReport(
            year: year,
            currency: ledger?.currency ?? "CNY",
            categories: rows
        )
        // Previous-year prefill rides the settings endpoint, not the report.
        // `previousRows` is read here to keep the two reads symmetric with
        // the settings repository's contract (the server's loadSettings
        // fetches both in one sweep).
    }

    // MARK: - Project report

    /// The project page report: line-mode statement over the project's
    /// entries + the equal-split settlement — `project.service.projectReport`.
    func projectReport(ledgerId: String, projectId: String) async throws -> ProjectReport {
        let projectRow = try await database.writer.read { db in
            try LocalProjectRow.fetchOne(db, key: projectId)
        }
        guard let projectRow else { throw LocalStoreError.ledgerNotFound }
        let entries = try await entriesByWhere(
            whereSql: """
                e.ledger_id = '\(LocalJournalRepository.escape(ledgerId))'
                AND e.project_id = '\(LocalJournalRepository.escape(projectId))'
                """,
            arguments: [],
            ledgerId: ledgerId
        )
        let memberRows = try await database.writer.read { db in
            try LocalProjectMemberRow
                .filter(Column("project_id") == projectId)
                .fetchAll(db)
        }
        let memberUserIds = memberRows.map(\.userId).sorted()
        let memberInfo: [String: EntryUserRef] = Dictionary(
            memberRows.map { ($0.userId, LocalIdentity.userRef(id: $0.userId)) },
            uniquingKeysWith: { first, _ in first }
        )
        var settlement: [String: (paid: Int, share: Int)] = [:]
        func ensureRow(_ userId: String) {
            if settlement[userId] == nil { settlement[userId] = (0, 0) }
        }
        for id in memberUserIds {
            ensureRow(id)
        }
        var accountSums: [String: (debit: Int, credit: Int, account: JournalLineAccountRef)] = [:]
        var totalExpenseCents = 0
        var totalIncomeCents = 0
        for entry in entries {
            var expenseCents = 0
            var incomeCents = 0
            for line in entry.lines {
                var sums = accountSums[line.accountId] ?? (0, 0, line.account)
                let debit = Int((line.debit * 100).rounded())
                let credit = Int((line.credit * 100).rounded())
                sums.debit += debit
                sums.credit += credit
                accountSums[line.accountId] = sums
                switch line.account.type {
                case .expense:
                    expenseCents += debit - credit
                case .income:
                    incomeCents += credit - debit
                case .asset, .liability, .equity:
                    break
                }
            }
            totalExpenseCents += expenseCents
            totalIncomeCents += incomeCents
            let valueCents = expenseCents - incomeCents
            if let paidById = entry.paidById {
                ensureRow(paidById)
                settlement[paidById]?.paid += valueCents
            }
            // Tagged participants split among themselves; untagged legacy
            // entries split across the current membership.
            let splitUserIds = (entry.participants ?? []).map(\.userId)
            let split = splitUserIds.isEmpty ? memberUserIds : Array(Set(splitUserIds)).sorted()
            if !split.isEmpty, valueCents != 0 {
                for (index, userId) in split.enumerated() {
                    ensureRow(userId)
                    settlement[userId]?.share += LocalAggregation.sliceCents(value: valueCents, splitUserIds: split, index: index)
                }
            }
        }
        func statementRow(_ account: JournalLineAccountRef, debit: Int, credit: Int) -> StatementRow {
            let balance = account.type == .expense ? debit - credit : credit - debit
            return StatementRow(
                id: account.id,
                name: account.name,
                code: account.code,
                type: account.type,
                sortOrder: account.sortOrder,
                balance: LocalValues.yuan(fromCents: balance),
                icon: account.icon,
                parentName: account.parent?.name,
                parentCode: account.parent?.code,
                parentAccountId: account.parent?.id,
                parentIcon: account.parent?.icon
            )
        }
        let accountRows = accountSums.values.map { ($0.account, $0.debit, $0.credit) }
        let income = accountRows
            .filter { $0.0.type == .income }
            .map { statementRow($0.0, debit: $0.1, credit: $0.2) }
            .filter { $0.balance != 0 }
            .sorted { $0.sortOrder < $1.sortOrder }
        let expense = accountRows
            .filter { $0.0.type == .expense }
            .map { statementRow($0.0, debit: $0.1, credit: $0.2) }
            .filter { $0.balance != 0 }
            .sorted { $0.sortOrder < $1.sortOrder }
        // Rows keyed by userId (map iteration order is unspecified, so the
        // key rides the dictionary); balance descending, the server's sort.
        let keyedRows: [ProjectSettlementRow] = settlement.map { userId, row in
            let info = memberInfo[userId] ?? EntryUserRef(id: userId, name: userId, email: nil, avatar: nil, isVirtual: nil)
            return ProjectSettlementRow(
                userId: userId,
                name: info.name,
                avatar: info.avatar,
                paid: LocalValues.yuan(fromCents: row.paid),
                share: LocalValues.yuan(fromCents: row.share),
                balance: LocalValues.yuan(fromCents: row.paid - row.share)
            )
        }.sorted { $0.balance > $1.balance }
        return ProjectReport(
            project: ProjectReportInfo(
                id: projectRow.id,
                ledgerId: projectRow.ledgerId,
                name: projectRow.name,
                status: projectRow.status,
                startDate: projectRow.startDate.flatMap { LocalValues.date(fromTimestamp: $0) },
                endDate: projectRow.endDate.flatMap { LocalValues.date(fromTimestamp: $0) }
            ),
            statement: IncomeStatement(
                income: income,
                expense: expense,
                totalIncome: LocalValues.yuan(fromCents: totalIncomeCents),
                totalExpense: LocalValues.yuan(fromCents: totalExpenseCents),
                net: LocalValues.yuan(fromCents: totalIncomeCents - totalExpenseCents)
            ),
            settlement: keyedRows,
            totals: ProjectReportTotals(entries: entries.count)
        )
    }

    // MARK: - Settings reads

    /// The year's budget settings (GET budget's local twin): the year's
    /// monthly amount + pins + the ledger's excluded categories, with the
    /// previous year's amount as the carry-over prefill.
    func budgetSettings(ledgerId: String, year: Int) async throws -> BudgetSettings {
        let ledger = try await ledgerRow(ledgerId: ledgerId)
        let yearRow = try await budgetYearRow(ledgerId: ledgerId, year: year)
        let previous = try await budgetYearRow(ledgerId: ledgerId, year: year - 1)
        let overrides = try await budgetOverrides(budgetYearId: yearRow?.id)
        let months = overrides.keys.sorted().compactMap { month -> BudgetMonthOverride? in
            guard let cents = overrides[month] else { return nil }
            return BudgetMonthOverride(month: month, cents: cents)
        }
        return BudgetSettings(
            year: year,
            cents: yearRow?.cents,
            carryOverCents: previous?.cents,
            months: months,
            excludedAccountIds: ledger?.budgetExcludedAccountIdsList() ?? []
        )
    }

    /// The year's category-budget settings (GET category-budgets' local
    /// twin): this year's pinned rows plus the previous year's prefill.
    func categoryBudgetSettings(ledgerId: String, year: Int) async throws -> CategoryBudgetSettings {
        func rows(for budgetYear: Int) async throws -> [CategoryBudgetAmount] {
            let rows = try await database.writer.read { db in
                try LocalCategoryBudgetRow
                    .filter(Column("ledger_id") == ledgerId
                        && Column("year") == budgetYear)
                    .order(Column("account_id"))
                    .fetchAll(db)
            }
            return rows.map { CategoryBudgetAmount(accountId: $0.accountId, cents: $0.cents) }
        }
        return CategoryBudgetSettings(
            year: year,
            categories: try await rows(for: year),
            carryOver: try await rows(for: year - 1)
        )
    }

    /// The ledger's projects with their members and entry counts — the
    /// projects list endpoint's local twin.
    func projects(ledgerId: String) async throws -> [QianlaiProject] {
        try await database.writer.read { db in
            let projectRows = try LocalProjectRow
                .filter(Column("ledger_id") == ledgerId)
                .order(Column("created_at"))
                .fetchAll(db)
            let memberRows = try LocalProjectMemberRow.fetchAll(
                db,
                sql: """
                    SELECT pm.* FROM qianlai_project_member pm
                    JOIN qianlai_project p ON p.id = pm.project_id
                    WHERE p.ledger_id = ?
                    """,
                arguments: [ledgerId]
            )
            let membersByProject = Dictionary(grouping: memberRows, by: \.projectId)
            let countRows = try Row.fetchAll(
                db,
                sql: """
                    SELECT project_id, COUNT(*) AS cnt FROM qianlai_journal_entry
                    WHERE ledger_id = ? AND project_id IS NOT NULL
                    GROUP BY project_id
                    """,
                arguments: [ledgerId]
            )
            var entryCounts: [String: Int] = [:]
            for row in countRows {
                let projectId: String = row["project_id"]
                let count: Int = row["cnt"] ?? 0
                entryCounts[projectId] = count
            }
            return projectRows.map { row in
                let members = (membersByProject[row.id] ?? []).map { member in
                    ProjectMemberRow(
                        id: member.id,
                        projectId: member.projectId,
                        userId: member.userId,
                        createdAt: LocalValues.date(fromTimestamp: member.createdAt) ?? .distantPast,
                        user: LocalIdentity.userRef(id: member.userId)
                    )
                }
                return QianlaiProject(
                    id: row.id,
                    ledgerId: row.ledgerId,
                    name: row.name,
                    description: row.description,
                    status: row.status,
                    startDate: row.startDate.flatMap { LocalValues.date(fromTimestamp: $0) },
                    endDate: row.endDate.flatMap { LocalValues.date(fromTimestamp: $0) },
                    createdAt: LocalValues.date(fromTimestamp: row.createdAt) ?? .distantPast,
                    updatedAt: LocalValues.date(fromTimestamp: row.updatedAt) ?? .distantPast,
                    members: members,
                    entryCount: entryCounts[row.id] ?? 0
                )
            }
        }
    }

    /// The owner's real accounts with their pockets and the asset/
    /// liability totals — the real-accounts endpoint's local twin. Pocket
    /// balances are the pocket account's signed all-time balance;
    /// RealAccount.balance aggregates its pockets.
    func realAccounts(ownerId: String, ledgerId: String) async throws -> (accounts: [RealAccount], totals: RealAccountTotals) {
        try await database.writer.read { db in
            let realRows = try LocalRealAccountRow
                .filter(Column("owner_id") == ownerId)
                .order(Column("created_at"))
                .fetchAll(db)
            let pocketRows = try LocalBookAccountRow
                .filter(Column("ledger_id") == ledgerId)
                .fetchAll(db)
            // Per-account all-time signed balances (asset debit-net,
            // liability credit-net) — the accounting-true sums.
            let balanceRows = try Row.fetchAll(
                db,
                sql: """
                    SELECT l.account_id AS account_id,
                           SUM(l.debit_cents) AS debit,
                           SUM(l.credit_cents) AS credit
                    FROM qianlai_journal_line l
                    JOIN qianlai_journal_entry e ON e.id = l.entry_id
                    WHERE e.ledger_id = ?
                    GROUP BY l.account_id
                    """,
                arguments: [ledgerId]
            )
            let typeByAccountId = Dictionary(
                pocketRows.map { ($0.id, AccountType(rawValue: $0.type) ?? .asset) },
                uniquingKeysWith: { first, _ in first }
            )
            var balanceByAccountId: [String: Double] = [:]
            for row in balanceRows {
                let accountId: String = row["account_id"]
                let debit: Int = row["debit"] ?? 0
                let credit: Int = row["credit"] ?? 0
                let type = typeByAccountId[accountId] ?? .asset
                let cents = type == .asset ? debit - credit : credit - debit
                balanceByAccountId[accountId] = LocalValues.yuan(fromCents: cents)
            }
            let ledgerRow = try LocalLedgerRow.fetchOne(db, key: ledgerId)
            var accounts: [RealAccount] = []
            var assets = 0.0
            var liabilities = 0.0
            for real in realRows {
                let linked = pocketRows.filter { $0.realAccountId == real.id }
                let pockets = linked.map { pocket in
                    RealAccountPocket(
                        id: pocket.id,
                        ledgerId: pocket.ledgerId,
                        ledgerName: ledgerRow?.name ?? "",
                        ledgerStatus: ledgerRow?.status ?? "active",
                        name: pocket.name,
                        code: pocket.code,
                        type: AccountType(rawValue: pocket.type) ?? .asset,
                        status: pocket.status,
                        icon: pocket.icon,
                        balance: balanceByAccountId[pocket.id] ?? 0
                    )
                }
                let total = pockets.reduce(0.0) { $0 + $1.balance }
                let type = AccountType(rawValue: real.type) ?? .asset
                if type == .asset { assets += total }
                if type == .liability { liabilities += total }
                accounts.append(
                    RealAccount(
                        id: real.id,
                        name: real.name,
                        type: type,
                        status: real.status,
                        icon: real.icon,
                        meta: LocalValues.metaDictionary(fromJSON: real.meta),
                        createdAt: LocalValues.date(fromTimestamp: real.createdAt) ?? .distantPast,
                        updatedAt: LocalValues.date(fromTimestamp: real.updatedAt) ?? .distantPast,
                        balance: total,
                        pockets: pockets
                    )
                )
            }
            let totals = RealAccountTotals(
                assets: (assets * 100).rounded() / 100,
                liabilities: (liabilities * 100).rounded() / 100,
                netWorth: ((assets - liabilities) * 100).rounded() / 100
            )
            return (accounts, totals)
        }
    }

    // MARK: - Helpers

    private func ledgerRow(ledgerId: String) async throws -> LocalLedgerRow? {
        try await database.writer.read { db in
            try LocalLedgerRow.fetchOne(db, key: ledgerId)
        }
    }

    /// The ledger's account chart in display order (sortOrder, then name,
    /// then id) — the server `listByLedger` contract the statement rows
    /// and every chart surface render in. Shared with the app-side stores
    /// (AccountStore's local branch reads the same list).
    func accounts(ledgerId: String) async throws -> [BookAccount] {
        let rows = try await database.writer.read { db in
            try LocalBookAccountRow
                .filter(Column("ledger_id") == ledgerId)
                .order(Column("sort_order"))
                .order(Column("name"))
                .order(Column("id"))
                .fetchAll(db)
        }
        return rows.map { row in
            BookAccount(
                id: row.id,
                ledgerId: row.ledgerId,
                name: row.name,
                code: row.code,
                type: AccountType(rawValue: row.type) ?? .expense,
                sortOrder: row.sortOrder,
                parentId: row.parentId,
                status: row.status,
                icon: row.icon,
                flags: row.flagsList,
                meta: LocalValues.metaDictionary(fromJSON: row.meta),
                createdAt: LocalValues.date(fromTimestamp: row.createdAt) ?? .distantPast
            )
        }
    }

    private func ledgerMemberUserIds(ledgerId: String) async throws -> Set<String> {
        try await database.writer.read { db in
            Set(try String.fetchAll(
                db, sql: "SELECT user_id FROM qianlai_ledger_member WHERE ledger_id = ?",
                arguments: [ledgerId]
            ))
        }
    }

    private func ledgerMembers(ledgerId: String) async throws -> ([LocalLedgerMemberRow], [String: LocalLedgerMemberRow]) {
        let rows = try await database.writer.read { db in
            try LocalLedgerMemberRow
                .filter(Column("ledger_id") == ledgerId)
                .fetchAll(db)
        }
        return (rows, Dictionary(rows.map { ($0.userId, $0) }, uniquingKeysWith: { first, _ in first }))
    }

    private func budgetYearRow(ledgerId: String, year: Int) async throws -> LocalBudgetYearRow? {
        try await database.writer.read { db in
            try LocalBudgetYearRow
                .filter(Column("ledger_id") == ledgerId
                    && Column("year") == year)
                .fetchOne(db)
        }
    }

    private func budgetOverrides(budgetYearId: String?) async throws -> [Int: Int] {
        guard let budgetYearId else { return [:] }
        let rows = try await database.writer.read { db in
            try LocalBudgetMonthOverrideRow
                .filter(Column("budget_year_id") == budgetYearId)
                .fetchAll(db)
        }
        return Dictionary(rows.map { ($0.month, $0.cents) }, uniquingKeysWith: { _, second in second })
    }

    /// All-time or windowed per-account debit/credit sums — the SQL twin
    /// of `sumLinesByAccount`. Accounting-true: no predicate beyond the
    /// window.
    private func sumLinesByAccountCents(
        ledgerId: String, from: Date?, to: Date?
    ) async throws -> [String: (debit: Int, credit: Int)] {
        try await database.writer.read { db in
            let rows = try Row.fetchAll(
                db,
                sql: """
                    SELECT l.account_id AS account_id,
                           SUM(l.debit_cents) AS debit,
                           SUM(l.credit_cents) AS credit
                    FROM qianlai_journal_line l
                    JOIN qianlai_journal_entry e ON e.id = l.entry_id
                    WHERE e.ledger_id = ? \(dateClause(from: from, to: to, prefix: "e."))
                    GROUP BY l.account_id
                    """,
                arguments: [ledgerId]
            )
            var sums: [String: (debit: Int, credit: Int)] = [:]
            for row in rows {
                let accountId: String = row["account_id"]
                let debit: Int = row["debit"] ?? 0
                let credit: Int = row["credit"] ?? 0
                sums[accountId] = (debit, credit)
            }
            return sums
        }
    }

    /// The stats activity set: the filter as passed — stats callers build
    /// `LocalJournalFilter` with includeExcluded=false (the server stats
    /// endpoints' default), the journal's day headers pass their own
    /// includeExcluded ride-along rule.
    private func activityEntries(
        ledgerId: String, filter: LocalJournalFilter
    ) async throws -> [JournalEntry] {
        try await journal.allEntries(ledgerId: ledgerId, filter: filter)
    }

    private func entriesByWhere(
        whereSql: String, arguments: StatementArguments, ledgerId: String
    ) async throws -> [JournalEntry] {
        let rows = try await database.writer.read { db in
            let rows = try LocalJournalEntryRow.fetchAll(
                db,
                sql: """
                    SELECT e.* FROM qianlai_journal_entry e
                    WHERE \(whereSql)
                    ORDER BY e.date DESC, e.entry_no DESC
                    """,
                arguments: arguments
            )
            return try journal.assemble(rows, ledgerId: ledgerId, db: db)
        }
        return rows
    }

    private func statementSumsCents(
        entries: [JournalEntry],
        shareMode: LocalReportShareMode,
        memberUserIds: Set<String>,
        viewerUserId: String
    ) -> [String: (debit: Int, credit: Int)] {
        switch shareMode {
        case .members:
            return LocalAggregation.shareSumsByAccountCents(entries) { entry in
                LocalAggregation.memberSharesCents(
                    lines: entry.lines,
                    participantUserIds: (entry.participants ?? []).map(\.userId),
                    paidById: entry.paidById,
                    memberUserIds: memberUserIds
                )
            }
        case .line:
            return LocalAggregation.lineSumsByAccountCents(entries)
        }
    }

    /// The filter-derived share mode: ledger scope speaks members, project
    /// scope speaks line — the same derivation the client store applies.
    private func filterShareMode(_ filter: LocalJournalFilter) -> LocalReportShareMode {
        filter.projectId == nil ? .members : .line
    }
}

/// The window clause shared by every raw-SQL read (`dateWindowWhere`):
/// `date >= from AND date <= to`, inclusive both ends.
private func dateClause(from: Date?, to: Date?, prefix: String = "e.") -> String {
    var clauses: [String] = []
    if let from {
        clauses.append("\(prefix)date >= '\(LocalJournalRepository.escape(LocalValues.timestamp(from: from)))'")
    }
    if let to {
        clauses.append("\(prefix)date <= '\(LocalJournalRepository.escape(LocalValues.timestamp(from: to)))'")
    }
    return clauses.isEmpty ? "" : "AND \(clauses.joined(separator: " AND "))"
}

/// The summary numerator — the server's StatShareMode subset the local
/// surfaces use (the settlement `member` axis is phase 4's concern).
nonisolated enum LocalReportShareMode {
    case line
    case members
}
