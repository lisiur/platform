//
//  LocalAggregation.swift
//  Qianlai
//

import Foundation

/// The local aggregation parity core (R3): pure functions mirroring the
/// server's `report.service.ts` / `budget.service.ts` / `category-budget.service.ts`
/// math line by line. The local report repositories reduce stored rows
/// through these — NEVER a re-derivation — so the double-computation
/// fixtures (AC2.1) hold field by field:
///
/// - every money step runs in integer cents with the server's
///   `Math.round(x * 100)` rounding, converting to yuan only at the
///   response boundary (the domain structs' Double fields);
/// - the split set is the deduped, sorted participant userIds, remainder
///   cents to the earliest ids (`sliceCents`);
/// - share attribution spreads each entry's share across its nonzero flow
///   lines proportionally and absorbs per-entry rounding drift on the
///   dominant line (`attributedEntryFlows`), so any grouping of slices
///   reconciles with the stat cards over the same window;
/// - day bucketing is `localDayKey` ((instant + offset) floored to a UTC
///   day, DST not modeled) — the stored `date_day_key` mirrors it, and
///   these helpers re-derive it only from stored instants.
///
/// All functions are `nonisolated` and total: tests pin the contract, and
/// any drift from the server's semantics = the repository must not merge.
nonisolated enum LocalAggregation {

    // MARK: - Split primitives (report.service.ts)

    /// A line's flow amount in integer cents, signed per statement
    /// convention: expense lines positive (debit − credit), income lines
    /// positive on the credit side; balance-sheet lines contribute nothing.
    static func lineFlowCents(
        debit: Double, credit: Double, type: AccountType
    ) -> Int {
        let debitCents = Int((debit * 100).rounded())
        let creditCents = Int((credit * 100).rounded())
        switch type {
        case .expense: return debitCents - creditCents
        case .income: return creditCents - debitCents
        case .asset, .liability, .equity: return 0
        }
    }

    /// The entry's splittable value in integer cents: expense − income
    /// (balance-sheet lines excluded). Mirrors the server's
    /// `entryValueCents` exactly — BOTH sides contribute `debit − credit`
    /// (an income line's credit is its magnitude, so it subtracts), which
    /// is NOT the signed flow the statement attribution spreads.
    static func entryValueCents(_ lines: [JournalLine]) -> Int {
        var value = 0
        for line in lines {
            switch line.account.type {
            case .expense, .income:
                let debit = Int((line.debit * 100).rounded())
                let credit = Int((line.credit * 100).rounded())
                value += debit - credit
            case .asset, .liability, .equity:
                break
            }
        }
        return value
    }

    /// The entry's split set: deduped participant userIds sorted by userId.
    static func splitSetOf(_ participantUserIds: [String]) -> [String] {
        Array(Set(participantUserIds)).sorted()
    }

    /// One slice of `value` in an equal split across `splitUserIds`: the
    /// base share plus one cent when this index carries the remainder.
    static func sliceCents(value: Int, splitUserIds: [String], index: Int) -> Int {
        guard !splitUserIds.isEmpty else { return 0 }
        let base = value.quotientAndRemainder(dividingBy: splitUserIds.count)
        // Math.floor semantics for negatives (income-heavy values).
        let quotient = base.remainder != 0 && (base.remainder < 0) != (splitUserIds.count < 0)
            ? base.quotient - 1
            : base.quotient
        let remainder = value - quotient * splitUserIds.count
        return quotient + (index < remainder ? 1 : 0)
    }

    /// The entry's split set with the untagged fallback applied.
    static func splitUserIdsOf(
        participantUserIds: [String],
        untaggedFallback: [String]
    ) -> [String] {
        let tagged = splitSetOf(participantUserIds)
        return tagged.isEmpty ? untaggedFallback : tagged
    }

    /// The ledger members' COMBINED share of an entry's value in cents:
    /// equal split across the split set, only members' slices summed.
    /// Untagged entries fall back to the payer alone (nil payer → nobody).
    static func memberSharesCents(
        lines: [JournalLine],
        participantUserIds: [String],
        paidById: String?,
        memberUserIds: Set<String>
    ) -> Int {
        let value = entryValueCents(lines)
        if value == 0 { return 0 }
        let splitUserIds = splitUserIdsOf(
            participantUserIds: participantUserIds,
            untaggedFallback: paidById.map { [$0] } ?? []
        )
        var share = 0
        for (index, userId) in splitUserIds.enumerated() where memberUserIds.contains(userId) {
            share += sliceCents(value: value, splitUserIds: splitUserIds, index: index)
        }
        return share
    }

    /// The viewer's share: tagged entries split across the tagged set,
    /// untagged entries borne by the payer alone.
    static func viewerShareCents(
        lines: [JournalLine],
        participantUserIds: [String],
        paidById: String?,
        viewerUserId: String
    ) -> Int {
        let value = entryValueCents(lines)
        if value == 0 { return 0 }
        let splitUserIds = splitUserIdsOf(
            participantUserIds: participantUserIds,
            untaggedFallback: [paidById ?? viewerUserId]
        )
        guard let index = splitUserIds.firstIndex(of: viewerUserId) else { return 0 }
        return sliceCents(value: value, splitUserIds: splitUserIds, index: index)
    }

    /// One member's settlement slice across the project's members — kept
    /// for the member settlement composition (phase 4 parity).
    static func settlementShareCents(
        lines: [JournalLine],
        participantUserIds: [String],
        memberUserId: String,
        projectMemberUserIds: [String]
    ) -> Int {
        let value = entryValueCents(lines)
        if value == 0 { return 0 }
        let splitUserIds = splitUserIdsOf(
            participantUserIds: participantUserIds,
            untaggedFallback: projectMemberUserIds.sorted()
        )
        guard let index = splitUserIds.firstIndex(of: memberUserId) else { return 0 }
        return sliceCents(value: value, splitUserIds: splitUserIds, index: index)
    }

    // MARK: - Share attribution

    /// One attributed flow line: the account's id plus the flow-side cents
    /// (expense positive, income positive) the entry's share distributed
    /// onto it.
    struct AttributedFlow: Equatable {
        var accountId: String
        var account: JournalLineAccountRef
        var type: AccountType
        var cents: Int
    }

    /// The attribution core behind every share-based surface: each entry's
    /// share (from `shareOf`) is distributed across its nonzero flow lines
    /// proportionally (rounded to cents), then per-entry rounding drift is
    /// absorbed by the entry's dominant line — Σ expense − Σ income equals
    /// the share exactly. Entries whose share is zero contribute nothing.
    /// `date` rides out for day bucketing.
    static func attributedEntryFlows(
        _ entries: [JournalEntry],
        shareOf: (JournalEntry) -> Int
    ) -> [(date: Date, flows: [AttributedFlow])] {
        var result: [(date: Date, flows: [AttributedFlow])] = []
        for entry in entries {
            let share = shareOf(entry)
            if share == 0 { continue }
            let value = entryValueCents(entry.lines)
            let flows: [(accountId: String, account: JournalLineAccountRef, type: AccountType, cents: Int)] =
                entry.lines.compactMap { line in
                    let cents = lineFlowCents(debit: line.debit, credit: line.credit, type: line.account.type)
                    guard cents != 0 else { return nil }
                    return (line.accountId, line.account, line.account.type, cents)
                }
            var attributed = flows.map { flow -> AttributedFlow in
                let cents = value == 0 ? 0 : Int((Double(flow.cents) * Double(share) / Double(value)).rounded())
                return AttributedFlow(accountId: flow.accountId, account: flow.account, type: flow.type, cents: cents)
            }
            // The attribution invariant: Σ expense attributed − Σ income
            // attributed equals the entry's share exactly.
            let net = attributed.reduce(0) { acc, flow in
                acc + (flow.type == .income ? -flow.cents : flow.cents)
            }
            let drift = share - net
            if drift != 0, !attributed.isEmpty {
                // Dominant line: largest |cents|, the FIRST on ties (the
                // server's reduce keeps the earlier operand with >=).
                var dominantIndex = 0
                for index in attributed.indices
                where abs(attributed[index].cents) >= abs(attributed[dominantIndex].cents) {
                    dominantIndex = index
                }
                attributed[dominantIndex].cents += drift
            }
            result.append((entry.date, attributed))
        }
        return result
    }

    // MARK: - Statement (buildStatementRows)

    /// debit − credit for debit-normal types, credit − debit otherwise, in
    /// yuan rounded to the cent — the server's `signedBalance`.
    static func signedBalance(type: AccountType, debitCents: Int, creditCents: Int) -> Double {
        let balanceCents = (type == .asset || type == .expense)
            ? debitCents - creditCents
            : creditCents - debitCents
        return LocalValues.yuan(fromCents: balanceCents)
    }

    /// Builds `IncomeStatement` from the account chart and per-account
    /// cents sums — the server's `buildStatementRows` with sums still in
    /// cents (the server converts to yuan first; same numbers either way,
    /// and cents-only keeps the local path integral end to end).
    static func buildStatementRows(
        accounts: [BookAccount],
        sumsCents: [String: (debit: Int, credit: Int)]
    ) -> IncomeStatement {
        func row(_ account: BookAccount) -> StatementRow {
            let sums = sumsCents[account.id] ?? (0, 0)
            return StatementRow(
                id: account.id,
                name: account.name,
                code: account.code,
                type: account.type,
                sortOrder: account.sortOrder,
                balance: signedBalance(type: account.type, debitCents: sums.debit, creditCents: sums.credit),
                icon: account.icon,
                parentName: nil,
                parentCode: nil,
                parentAccountId: nil,
                parentIcon: nil
            )
        }
        let income = accounts.filter { $0.type == .income }.map(row).filter { $0.balance != 0 }
        let expense = accounts.filter { $0.type == .expense }.map(row).filter { $0.balance != 0 }
        let totalIncome = (income.reduce(0) { $0 + $1.balance * 100 }).rounded() / 100
        let totalExpense = (expense.reduce(0) { $0 + $1.balance * 100 }).rounded() / 100
        return IncomeStatement(
            income: income,
            expense: expense,
            totalIncome: totalIncome,
            totalExpense: totalExpense,
            net: (totalIncome * 100 - totalExpense * 100).rounded() / 100
        )
    }

    /// Per-account cents sums of the given share over the entries —
    /// `shareSumsByAccount` in cents: expense flows into debit, income
    /// flows into credit.
    static func shareSumsByAccountCents(
        _ entries: [JournalEntry],
        shareOf: (JournalEntry) -> Int
    ) -> [String: (debit: Int, credit: Int)] {
        var sums: [String: (debit: Int, credit: Int)] = [:]
        for (_, flows) in attributedEntryFlows(entries, shareOf: shareOf) {
            for flow in flows {
                let current = sums[flow.accountId] ?? (0, 0)
                if flow.type == .income {
                    sums[flow.accountId] = (current.debit, current.credit + flow.cents)
                } else {
                    sums[flow.accountId] = (current.debit + flow.cents, current.credit)
                }
            }
        }
        return sums
    }

    /// Per-account raw debit/credit cents sums over every line —
    /// `lineSumsByAccount` (shareMode=line's numerator).
    static func lineSumsByAccountCents(_ entries: [JournalEntry]) -> [String: (debit: Int, credit: Int)] {
        var sums: [String: (debit: Int, credit: Int)] = [:]
        for entry in entries {
            for line in entry.lines {
                let debit = Int((line.debit * 100).rounded())
                let credit = Int((line.credit * 100).rounded())
                let current = sums[line.accountId] ?? (0, 0)
                sums[line.accountId] = (current.debit + debit, current.credit + credit)
            }
        }
        return sums
    }

    // MARK: - Day bucketing (localDayKey)

    /// The "yyyy-MM-dd" LOCAL day of an instant under a fixed UTC offset —
    /// ((date + offset) floored to a UTC day). The one day-bucketing rule
    /// every summary shares; the stored `date_day_key` column holds the
    /// same value computed at write time.
    static func localDayKey(_ date: Date, tzOffsetMinutes: Int) -> String {
        let shifted = date.timeIntervalSince1970 + Double(tzOffsetMinutes) * 60
        // Floor division, not remainder subtraction — negative instants
        // (pre-1970 dates, none expected but the math must stay total) must
        // floor DOWN onto the previous UTC day like Math.floor does.
        let dayStart = (shifted / 86_400).rounded(.down) * 86_400
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
        let components = calendar.dateComponents(
            [.year, .month, .day], from: Date(timeIntervalSince1970: dayStart)
        )
        return String(
            format: "%04d-%02d-%02d",
            components.year ?? 0, components.month ?? 0, components.day ?? 0
        )
    }

    /// Calendar year of an instant under a fixed UTC offset.
    static func yearIndexOf(_ date: Date, tzOffsetMinutes: Int) -> Int {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
        let shifted = date.addingTimeInterval(Double(tzOffsetMinutes) * 60)
        return calendar.component(.year, from: shifted)
    }

    /// Calendar month (1..12) of an instant under a fixed UTC offset.
    static func monthIndexOf(_ date: Date, tzOffsetMinutes: Int) -> Int {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
        let shifted = date.addingTimeInterval(Double(tzOffsetMinutes) * 60)
        return calendar.component(.month, from: shifted)
    }

    /// [from, to] of a natural month under a fixed UTC offset — the
    /// budget aggregate's window (budget.service `monthWindow`). The JS
    /// original rides 0-indexed UTC months: `Date.UTC(year, month - 1, 1)`
    /// for the window's own month and `Date.UTC(year, month, 1)` — next
    /// month's first — for the end, rolling December into January with no
    /// special case. Swift's calendar is 1-indexed, so the end is
    /// month + 1 (through `.byAdding`, which rolls over the same way),
    /// and the end's −1 rides in MILLISECONDS like the server's (the
    /// `to` bound is inclusive, so an entry at ...:59.999 stays in).
    static func monthWindow(year: Int, month: Int, tzOffsetMinutes: Int) -> (from: Date, to: Date) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
        let offset = Double(tzOffsetMinutes) * 60
        let monthStartUTC = calendar.date(from: DateComponents(year: year, month: month, day: 1))
            ?? Date(timeIntervalSince1970: 0)
        let nextMonthStartUTC = calendar.date(byAdding: .month, value: 1, to: monthStartUTC)
            ?? monthStartUTC
        let from = monthStartUTC.addingTimeInterval(-offset)
        let to = nextMonthStartUTC.addingTimeInterval(-offset - 0.001)
        return (from, to)
    }

    // MARK: - Daily summary

    /// The line-mode daily summary (`dailySummaryFromLines`): expense
    /// lines' debit-net feeds expense, income lines' credit-net feeds
    /// income, transfers feed neither. Days newest first.
    static func dailySummaryFromLines(
        _ entries: [JournalEntry], tzOffsetMinutes: Int
    ) -> [DayIncomeExpense] {
        var order: [String] = []
        var days: [String: (income: Int, expense: Int)] = [:]
        for entry in entries {
            let day = localDayKey(entry.date, tzOffsetMinutes: tzOffsetMinutes)
            if days[day] == nil {
                days[day] = (0, 0)
                order.append(day)
            }
            for line in entry.lines {
                let debit = Int((line.debit * 100).rounded())
                let credit = Int((line.credit * 100).rounded())
                switch line.account.type {
                case .expense:
                    days[day]?.expense += debit - credit
                case .income:
                    days[day]?.income += credit - debit
                case .asset, .liability, .equity:
                    break
                }
            }
        }
        return order.sorted(by: >).map { day in
            let totals = days[day] ?? (0, 0)
            return DayIncomeExpense(day: day, incomeCents: totals.income, expenseCents: totals.expense)
        }
    }

    /// The members-mode daily summary (`memberShareDailySummary`): each
    /// entry's member share attributed across its flow lines, each slice
    /// landing on the entry's LOCAL day.
    static func memberShareDailySummary(
        _ entries: [JournalEntry],
        memberUserIds: Set<String>,
        tzOffsetMinutes: Int
    ) -> [DayIncomeExpense] {
        var order: [String] = []
        var days: [String: (income: Int, expense: Int)] = [:]
        for (date, flows) in attributedEntryFlows(entries, shareOf: { entry in
            memberSharesCents(
                lines: entry.lines,
                participantUserIds: (entry.participants ?? []).map(\.userId),
                paidById: entry.paidById,
                memberUserIds: memberUserIds
            )
        }) {
            let day = localDayKey(date, tzOffsetMinutes: tzOffsetMinutes)
            if days[day] == nil {
                days[day] = (0, 0)
                order.append(day)
            }
            for flow in flows {
                switch flow.type {
                case .expense:
                    days[day]?.expense += flow.cents
                case .income:
                    days[day]?.income += flow.cents
                case .asset, .liability, .equity:
                    break
                }
            }
        }
        return order.sorted(by: >).map { day in
            let totals = days[day] ?? (0, 0)
            return DayIncomeExpense(day: day, incomeCents: totals.income, expenseCents: totals.expense)
        }
    }

    // MARK: - Category summary

    /// Category-row ordering shared by both modes: amount descending with
    /// a code/name/id tiebreak (`orderCategoryRows`).
    static func orderCategoryRows(_ rows: [CategoryAmountRow]) -> [CategoryAmountRow] {
        rows.sorted { a, b in
            if a.amountCents != b.amountCents { return a.amountCents > b.amountCents }
            let keyA = a.code ?? a.name ?? a.accountId
            let keyB = b.code ?? b.name ?? b.accountId
            if keyA != keyB { return keyA < keyB }
            return false
        }
    }

    /// The summary side an account type feeds — nil for balance-sheet
    /// lines (`categorySideOf`).
    static func categorySideOf(_ type: AccountType) -> String? {
        switch type {
        case .expense: return "expense"
        case .income: return "income"
        default: return nil
        }
    }

    /// The members-mode category summary: the daily summary's member share
    /// keyed per account instead of per day.
    static func memberShareCategorySummary(
        _ entries: [JournalEntry],
        memberUserIds: Set<String>
    ) -> CategorySummaryResponse {
        shareCategorySummary(entries) { entry in
            memberSharesCents(
                lines: entry.lines,
                participantUserIds: (entry.participants ?? []).map(\.userId),
                paidById: entry.paidById,
                memberUserIds: memberUserIds
            )
        }
    }

    /// The line-mode category summary (`sumLinesByCategory`): raw line
    /// sums, every participant counts. No share, no drift absorption —
    /// exact per-line sums.
    static func lineCategorySummary(_ entries: [JournalEntry]) -> CategorySummaryResponse {
        var buckets: [String: [String: CategoryAmountRow]] = ["expense": [:], "income": [:]]
        for entry in entries {
            for line in entry.lines {
                guard let side = categorySideOf(line.account.type) else { continue }
                let cents = lineFlowCents(debit: line.debit, credit: line.credit, type: line.account.type)
                if var row = buckets[side]?[line.accountId] {
                    row.amountCents += cents
                    buckets[side]?[line.accountId] = row
                } else {
                    buckets[side]?[line.accountId] = CategoryAmountRow(
                        accountId: line.accountId,
                        name: line.account.name,
                        code: line.account.code,
                        parentName: line.account.parent?.name,
                        parentCode: line.account.parent?.code,
                        parentAccountId: line.account.parent?.id,
                        parentIcon: line.account.parent?.icon,
                        icon: line.account.icon,
                        amountCents: cents
                    )
                }
            }
        }
        return CategorySummaryResponse(
            expense: orderCategoryRows(Array((buckets["expense"] ?? [:]).values)),
            income: orderCategoryRows(Array((buckets["income"] ?? [:]).values))
        )
    }

    /// The one-share closure every share-based category summary reduces
    /// through (`shareCategorySummary`).
    static func shareCategorySummary(
        _ entries: [JournalEntry],
        shareOf: (JournalEntry) -> Int
    ) -> CategorySummaryResponse {
        var buckets: [String: [String: CategoryAmountRow]] = ["expense": [:], "income": [:]]
        for (_, flows) in attributedEntryFlows(entries, shareOf: shareOf) {
            for flow in flows {
                guard let side = categorySideOf(flow.type) else { continue }
                if var row = buckets[side]?[flow.accountId] {
                    row.amountCents += flow.cents
                    buckets[side]?[flow.accountId] = row
                } else {
                    buckets[side]?[flow.accountId] = CategoryAmountRow(
                        accountId: flow.accountId,
                        name: flow.account.name,
                        code: flow.account.code,
                        parentName: flow.account.parent?.name,
                        parentCode: flow.account.parent?.code,
                        parentAccountId: flow.account.parent?.id,
                        parentIcon: flow.account.parent?.icon,
                        icon: flow.account.icon,
                        amountCents: flow.cents
                    )
                }
            }
        }
        return CategorySummaryResponse(
            expense: orderCategoryRows(Array((buckets["expense"] ?? [:]).values)),
            income: orderCategoryRows(Array((buckets["income"] ?? [:]).values))
        )
    }

    // MARK: - Budget (budget.service.ts)

    /// Raw activity rows → budget inputs (`toBudgetActivityRows`): expense
    /// cents per entry plus its excluded portion. Income/transfer entries
    /// come through with zero expense cents — they still mark their month.
    struct BudgetActivityRow {
        var date: Date
        var expenseCents: Int
        var excludedCents: Int
    }

    static func toBudgetActivityRows(_ entries: [JournalEntry]) -> [BudgetActivityRow] {
        entries.map { entry in
            var expenseCents = 0
            for line in entry.lines {
                guard line.account.type == .expense else { continue }
                let debit = Int((line.debit * 100).rounded())
                let credit = Int((line.credit * 100).rounded())
                expenseCents += debit - credit
            }
            return BudgetActivityRow(
                date: entry.date,
                expenseCents: expenseCents,
                excludedCents: entry.excludedFromBudget ? expenseCents : 0
            )
        }
    }

    /// Buckets a year's budget activity by month (`aggregateBudgetMonths`).
    static func aggregateBudgetMonths(
        _ activity: [BudgetActivityRow], tzOffsetMinutes: Int, anchorYear: Int
    ) -> [Int: (countedCents: Int, excludedCents: Int)] {
        var byMonth: [Int: (counted: Int, excluded: Int)] = [:]
        for row in activity {
            guard yearIndexOf(row.date, tzOffsetMinutes: tzOffsetMinutes) == anchorYear else { continue }
            let month = monthIndexOf(row.date, tzOffsetMinutes: tzOffsetMinutes)
            let aggregate = byMonth[month] ?? (0, 0)
            byMonth[month] = (
                aggregate.counted + row.expenseCents - row.excludedCents,
                aggregate.excluded + row.excludedCents
            )
        }
        return byMonth.mapValues { (countedCents: $0.counted, excludedCents: $0.excluded) }
    }

    /// The earliest activity month (1..12) of the anchor year, if any.
    static func firstActivityMonth(
        _ activity: [BudgetActivityRow], tzOffsetMinutes: Int, anchorYear: Int
    ) -> Int? {
        var first: Int?
        for row in activity {
            guard yearIndexOf(row.date, tzOffsetMinutes: tzOffsetMinutes) == anchorYear else { continue }
            let month = monthIndexOf(row.date, tzOffsetMinutes: tzOffsetMinutes)
            if first == nil || month < first! { first = month }
        }
        return first
    }

    /// A month's effective budget: its own override when pinned, else the
    /// year's monthly amount.
    static func resolveMonthBudgetCents(
        yearCents: Int?, overrides: [Int: Int], month: Int
    ) -> Int? {
        overrides[month] ?? yearCents
    }

    /// The year-to-date table (`buildBudgetYear`): the year's first
    /// recorded month through the month before the anchor; months without
    /// activity stay out. Nil when the year has no budget row or no
    /// recorded activity.
    static func buildBudgetYear(
        activity: [BudgetActivityRow],
        yearCents: Int?,
        overrides: [Int: Int],
        anchorYear: Int,
        anchorMonth: Int,
        tzOffsetMinutes: Int
    ) -> BudgetYear? {
        guard let yearCents else { return nil }
        guard let firstMonth = firstActivityMonth(activity, tzOffsetMinutes: tzOffsetMinutes, anchorYear: anchorYear)
        else { return nil }
        let aggregates = aggregateBudgetMonths(activity, tzOffsetMinutes: tzOffsetMinutes, anchorYear: anchorYear)
        var rows: [BudgetYearRow] = []
        var netCents = 0
        var month = firstMonth
        while month < anchorMonth {
            guard let aggregate = aggregates[month] else {
                month += 1
                continue
            }
            let budgetCents = resolveMonthBudgetCents(yearCents: yearCents, overrides: overrides, month: month)
                ?? yearCents
            let diffCents = aggregate.countedCents - budgetCents
            rows.append(
                BudgetYearRow(
                    year: anchorYear, month: month,
                    budgetCents: budgetCents,
                    countedCents: aggregate.countedCents,
                    diffCents: diffCents
                )
            )
            netCents += diffCents
            month += 1
        }
        return BudgetYear(startYear: anchorYear, startMonth: firstMonth, rows: rows, netCents: netCents)
    }

    // MARK: - Category budget rollup (category-budget.service.ts)

    /// Subtree-including-self roll-up: each budget row's spent total is
    /// its own sum plus every descendant's, walked DOWN with a visited
    /// set (`rollUpCategorySums`).
    static func rollUpCategorySums(
        accounts: [BookAccount],
        sumsByAccountId: [String: Int],
        budgetAccountIds: [String]
    ) -> [(accountId: String, spentCents: Int)] {
        var childrenByParent: [String: [String]] = [:]
        for account in accounts {
            guard let parentId = account.parentId else { continue }
            childrenByParent[parentId, default: []].append(account.id)
        }
        func subtreeSum(_ rootId: String) -> Int {
            var total = 0
            var visited = Set<String>()
            var stack = [rootId]
            while let id = stack.popLast() {
                guard visited.insert(id).inserted else { continue }
                total += sumsByAccountId[id] ?? 0
                stack.append(contentsOf: childrenByParent[id] ?? [])
            }
            return total
        }
        return budgetAccountIds.map { ($0, subtreeSum($0)) }
    }
}
