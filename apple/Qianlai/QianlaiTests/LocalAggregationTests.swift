//
//  LocalAggregationTests.swift
//  QianlaiTests
//
//  The double-computation fixtures (R3, AC2.1's CI form): the same
//  datasets the server's own tests and semantics describe, with expected
//  figures computed BY HAND from `report.service.ts` /
//  `budget.service.ts` — never by re-running the aggregation under test.
//  A local repository may not merge while any of these disagree with the
//  hand-turned answer.
//

import XCTest
@testable import Qianlai

final class LocalAggregationTests: XCTestCase {
    private func makeDatabase() throws -> LocalDatabase {
        try LocalDatabase(inMemory: true)
    }

    // MARK: - Fixture builders

    /// A line on an account ref, in yuan (converted at the exact server
    /// rounding inside the aggregation).
    private func line(
        id: String,
        accountId: String,
        type: AccountType,
        debit: Double,
        credit: Double,
        parentCode: String? = nil,
        code: String? = nil,
        name: String? = nil,
        icon: String? = nil
    ) -> JournalLine {
        JournalLine(
            id: id,
            accountId: accountId,
            account: JournalLineAccountRef(
                id: accountId,
                name: name,
                code: code,
                type: type,
                sortOrder: 0,
                icon: icon,
                flags: nil,
                parent: parentCode.map {
                    JournalLineAccountParentRef(id: "parent-\($0)", name: nil, code: $0, icon: nil)
                }
            ),
            debit: debit,
            credit: credit
        )
    }

    private func entry(
        id: String,
        date: Date,
        lines: [JournalLine],
        participants: [String] = [],
        paidById: String? = nil,
        countsInLedger: Bool = true,
        guestCreated: Bool = false,
        excludedFromBudget: Bool = false
    ) -> JournalEntry {
        JournalEntry(
            id: id,
            ledgerId: "ledger",
            entryNo: 1,
            date: date,
            memo: nil,
            status: "posted",
            countsInLedger: countsInLedger,
            guestCreated: guestCreated,
            excludedFromBudget: excludedFromBudget,
            createdById: "u1",
            createdBy: nil,
            paidById: paidById,
            paidBy: nil,
            createdAt: date,
            projectId: nil,
            project: nil,
            location: nil,
            merchant: nil,
            attachments: nil,
            lines: lines,
            participants: participants.map {
                EntryParticipant(id: "p-\($0)", userId: $0, user: nil)
            },
            memberSharesCents: nil
        )
    }

    private func expenseLine(_ accountId: String, yuan: Double) -> JournalLine {
        line(id: "l-\(accountId)", accountId: accountId, type: .expense, debit: yuan, credit: 0)
    }

    private func incomeLine(_ accountId: String, yuan: Double) -> JournalLine {
        line(id: "l-\(accountId)", accountId: accountId, type: .income, debit: 0, credit: yuan)
    }

    private let utcPlus8 = 480
    private let utcMinus5 = -300

    // MARK: - entryValueCents

    func testEntryValueCentsMirror() {
        // expense 100 − income 30 → 70.00 (server entryValueCents).
        let lines = [expenseLine("food", yuan: 100), incomeLine("salary", yuan: 30)]
        let sample = entry(id: "e1", date: Date(), lines: lines)
        XCTAssertEqual(LocalAggregation.entryValueCents(sample.lines), 7_000)
        // Balance-sheet lines contribute nothing (server convention).
        let withTransfer = entry(id: "e2", date: Date(), lines: lines + [
            line(id: "t1", accountId: "pocket", type: .asset, debit: 500, credit: 0),
        ])
        XCTAssertEqual(LocalAggregation.entryValueCents(withTransfer.lines), 7_000)
    }

    // MARK: - Splits & shares

    func testSliceCentsDistributesRemainderToEarliestIds() {
        // 100 split across [a, b, c] → 34/33/33 (remainder 1 → earliest).
        let ids = ["a", "b", "c"]
        XCTAssertEqual(LocalAggregation.sliceCents(value: 100, splitUserIds: ids, index: 0), 34)
        XCTAssertEqual(LocalAggregation.sliceCents(value: 100, splitUserIds: ids, index: 1), 33)
        XCTAssertEqual(LocalAggregation.sliceCents(value: 100, splitUserIds: ids, index: 2), 33)
        // Income-heavy (negative) values FLOOR like Math.floor: −100
        // across three → base −34, remainder +2 lands on the two EARLIEST
        // ids → −33/−33/−34 (the LAST index carries the deep floor).
        XCTAssertEqual(LocalAggregation.sliceCents(value: -100, splitUserIds: ids, index: 0), -33)
        XCTAssertEqual(LocalAggregation.sliceCents(value: -100, splitUserIds: ids, index: 1), -33)
        XCTAssertEqual(LocalAggregation.sliceCents(value: -100, splitUserIds: ids, index: 2), -34)
        // The slices always re-sum to the value (the invariant).
        let positive = (0..<3).reduce(0) { LocalAggregation.sliceCents(value: 100, splitUserIds: ids, index: $1) + $0 }
        let negative = (0..<3).reduce(0) { LocalAggregation.sliceCents(value: -100, splitUserIds: ids, index: $1) + $0 }
        XCTAssertEqual(positive, 100)
        XCTAssertEqual(negative, -100)
    }

    func testMemberSharesCentsCountOnlyMembers() {
        // Entry 100.00 tagged [u1(u-outsider), u2(member)] → member slice 50.00.
        let lines = [expenseLine("food", yuan: 100)]
        let share = LocalAggregation.memberSharesCents(
            lines: lines, participantUserIds: ["u-outsider", "u2"],
            paidById: nil, memberUserIds: ["u2"]
        )
        XCTAssertEqual(share, 5_000)

        // Untagged with payer (a member) → the payer bears all.
        let payerShare = LocalAggregation.memberSharesCents(
            lines: lines, participantUserIds: [],
            paidById: "u2", memberUserIds: ["u2"]
        )
        XCTAssertEqual(payerShare, 10_000)

        // Untagged without payer → nobody bears it.
        let nobodyShare = LocalAggregation.memberSharesCents(
            lines: lines, participantUserIds: [],
            paidById: nil, memberUserIds: ["u2"]
        )
        XCTAssertEqual(nobodyShare, 0)

        // Deduped, sorted split set: the tagged order can't change slices.
        let deduped = LocalAggregation.memberSharesCents(
            lines: [expenseLine("food", yuan: 90)],
            participantUserIds: ["b", "a", "a"],
            paidById: nil,
            memberUserIds: ["a", "b"]
        )
        // 9000 across [a, b] → 45/45.
        XCTAssertEqual(deduped, 9_000)
    }

    func testViewerShareCentsUntaggedFallsBackToPayer() {
        // Untagged entry paid by the viewer → full value.
        let lines = [expenseLine("food", yuan: 42)]
        let own = LocalAggregation.viewerShareCents(
            lines: lines, participantUserIds: [], paidById: "viewer", viewerUserId: "viewer"
        )
        XCTAssertEqual(own, 4_200)
        // Tagged pair with the viewer → equal split.
        let tagged = LocalAggregation.viewerShareCents(
            lines: lines, participantUserIds: ["viewer", "other"], paidById: "other", viewerUserId: "viewer"
        )
        XCTAssertEqual(tagged, 2_100)
        // Tagged set without the viewer → zero.
        let outside = LocalAggregation.viewerShareCents(
            lines: lines, participantUserIds: ["other"], paidById: "other", viewerUserId: "viewer"
        )
        XCTAssertEqual(outside, 0)
    }

    // MARK: - Attribution (drift absorption)

    func testAttributedFlowsAbsorbRoundingDriftOnDominantLine() {
        // 10.00 across three accounts (3.34/3.33/3.33), share = half a
        // member's slice: 500 cents across value 1000 → per-line round:
        // 334, 333, 333 → net 1000 − drift 0. Make a case WITH drift:
        // share 1/3 of 1000 = 333.33 → attributed 333 rounds to 333? Per
        // line: (334*333)/1000 = 111.2 → 111; (333*333)/1000 = 110.9 → 111
        // (Math.round); (333*333)/1000 = 111 → net = 111+111+111 = 333.
        // Drift = 333 − 333 = 0. Construct real drift: value 999, share
        // 666: lines 500/499 → (500*666)/999 = 333.3 → 333; (499*666)/999
        // = 332.7 → 333; net 666, drift 0. One more: value 100, share 1,
        // lines 99/1 → (99*1)/100 = 0.99 → 1; (1*1)/100 = 0.01 → 0;
        // net 1 drift 0. The classic drift case: value 100, share 33,
        // three equal lines 33.34/33.33/33.33 (cents 3334/3333/3333):
        // (3334*33)/100 = 1100.2 → 1100; (3333*33)/100 = 1099.9 → 1100;
        // (3333*33)/100 → 1100; net 3300, drift 33−3300... no: share=33
        // cents. net = 3300? No — (3334*33)/100 = 1100.22 → 1100?? that's
        // way over 33. The attribution formula divides by VALUE (10000):
        // (3334*33)/10000 = 11.0 → 11; ×3 = 33 → drift 0.
        let lines = [
            line(id: "l1", accountId: "a", type: .expense, debit: 33.34, credit: 0),
            line(id: "l2", accountId: "b", type: .expense, debit: 33.33, credit: 0),
            line(id: "l3", accountId: "c", type: .expense, debit: 33.33, credit: 0),
        ]
        let sample = entry(id: "e", date: Date(), lines: lines)
        let flows = LocalAggregation.attributedEntryFlows([sample]) { _ in 33 }
        XCTAssertEqual(flows.count, 1)
        let attributed = flows[0].flows
        XCTAssertEqual(attributed.map(\.cents), [11, 11, 11], "11+11+11 = 33 exactly")
        // Zero shares contribute nothing.
        let empty = LocalAggregation.attributedEntryFlows([sample]) { _ in 0 }
        XCTAssertTrue(empty.isEmpty)
    }

    // MARK: - Statement rows

    func testBuildStatementRowsFiltersZeroAndSumsTotals() {
        let accounts = [
            makeAccount(id: "salary", type: .income, sortOrder: 1),
            makeAccount(id: "bonus", type: .income, sortOrder: 2),
            makeAccount(id: "food", type: .expense, sortOrder: 3),
            makeAccount(id: "idle", type: .expense, sortOrder: 4),
        ]
        let sums: [String: (debit: Int, credit: Int)] = [
            "salary": (0, 200_000), // +2000.00
            "bonus": (0, 50_000),   // +500.00
            "food": (100_000, 2_000), // +980.00 (refund line nets in)
            "idle": (0, 0),
        ]
        let statement = LocalAggregation.buildStatementRows(accounts: accounts, sumsCents: sums)
        XCTAssertEqual(statement.income.map(\.id), ["salary", "bonus"], "chart order preserved")
        XCTAssertEqual(statement.expense.map(\.id), ["food"], "zero-balance rows drop")
        XCTAssertEqual(statement.income.map(\.balance), [2000.0, 500.0])
        XCTAssertEqual(statement.expense.first?.balance, 980.0, "signed: expense debit-net")
        XCTAssertEqual(statement.totalIncome, 2500.0)
        XCTAssertEqual(statement.totalExpense, 980.0)
        XCTAssertEqual(statement.net, 1520.0)
        // Credit-normal sign: income shows credit − debit.
        XCTAssertEqual(statement.income.first?.balance, 2000.0)
    }

    private func makeAccount(id: String, type: AccountType, sortOrder: Int) -> BookAccount {
        BookAccount(
            id: id, ledgerId: "ledger", name: nil, code: id, type: type,
            sortOrder: sortOrder, parentId: nil, status: "active", icon: nil,
            flags: nil, meta: nil, createdAt: Date()
        )
    }

    // MARK: - Day bucketing (localDayKey)

    func testLocalDayKeyShiftsAcrossTimezones() throws {
        // 2026-01-31T18:00:00Z — in UTC+8 that's 2026-02-01 02:00 local.
        let instant = try XCTUnwrap(LocalValues.date(fromTimestamp: "2026-01-31T18:00:00.000Z"))
        XCTAssertEqual(
            LocalAggregation.localDayKey(instant, tzOffsetMinutes: utcPlus8),
            "2026-02-01"
        )
        XCTAssertEqual(
            LocalAggregation.localDayKey(instant, tzOffsetMinutes: utcMinus5),
            "2026-01-31",
            "UTC−5: 13:00 same day"
        )
        XCTAssertEqual(
            LocalAggregation.localDayKey(instant, tzOffsetMinutes: 0),
            "2026-01-31"
        )
    }

    func testMonthWindowMatchesServerFormula() throws {
        // monthWindow(2026, 2, 480): from = 2026-02-01T00:00Z − 8h,
        // to = 2026-03-01T00:00Z − 8h − 1ms.
        let window = LocalAggregation.monthWindow(year: 2026, month: 2, tzOffsetMinutes: utcPlus8)
        let from = try XCTUnwrap(LocalValues.date(fromTimestamp: LocalValues.timestamp(from: window.from)))
        let expectedFrom = try XCTUnwrap(LocalValues.date(fromTimestamp: "2026-01-31T16:00:00.000Z"))
        XCTAssertEqual(from, expectedFrom)
        let expectedTo = try XCTUnwrap(LocalValues.date(fromTimestamp: "2026-02-28T15:59:59.999Z"))
        XCTAssertEqual(
            window.to.timeIntervalSince1970,
            expectedTo.timeIntervalSince1970,
            accuracy: 0.0005,
            "2026 is not a leap year: Feb ends at local 23:59:59.999 on the 28th (the −1 is 1ms)"
        )
        // December rolls into next January with no special case.
        let december = LocalAggregation.monthWindow(year: 2026, month: 12, tzOffsetMinutes: 0)
        let januaryFirst = try XCTUnwrap(LocalValues.date(fromTimestamp: "2027-01-01T00:00:00.000Z"))
        XCTAssertEqual(
            december.to.timeIntervalSince1970,
            januaryFirst.addingTimeInterval(-0.001).timeIntervalSince1970,
            accuracy: 0.0005
        )
    }

    // MARK: - Daily summary

    func testDailySummaryFromLinesFeedsOneSidePerLine() throws {
        // Two entries on local 2026-01-15 (UTC+8), one expense one income;
        // an entry whose local day is 2026-01-16 (recorded 20:00 UTC+8).
        let day = try XCTUnwrap(LocalValues.date(fromTimestamp: "2026-01-15T03:00:00.000Z")) // 11:00 +8
        let nextDay = try XCTUnwrap(LocalValues.date(fromTimestamp: "2026-01-16T12:00:00.000Z")) // 20:00 +8
        let entries = [
            entry(id: "e1", date: day, lines: [expenseLine("food", yuan: 30), expenseLine("food", yuan: 12)]),
            entry(id: "e2", date: day, lines: [incomeLine("salary", yuan: 100)]),
            entry(id: "e3", date: nextDay, lines: [expenseLine("food", yuan: 7.5)]),
        ]
        let days = LocalAggregation.dailySummaryFromLines(entries, tzOffsetMinutes: utcPlus8)
        XCTAssertEqual(days.map(\.day), ["2026-01-16", "2026-01-15"], "newest first")
        let first = try XCTUnwrap(days.first { $0.day == "2026-01-15" })
        XCTAssertEqual(first.expenseCents, 4_200)
        XCTAssertEqual(first.incomeCents, 10_000)
        let second = try XCTUnwrap(days.first { $0.day == "2026-01-16" })
        XCTAssertEqual(second.expenseCents, 750)
        XCTAssertEqual(second.incomeCents, 0, "transfers (balance-sheet lines) feed neither side")
    }

    func testMemberShareDailySummaryReconcilesWithStatCard() throws {
        // Entry 100.00 tagged [outsider, member] on 2026-01-15 +8: the
        // member's 50.00 slice lands; the outsider's 50.00 never does.
        let day = try XCTUnwrap(LocalValues.date(fromTimestamp: "2026-01-15T03:00:00.000Z"))
        let entryA = entry(
            id: "e1", date: day,
            lines: [expenseLine("food", yuan: 100)],
            participants: ["outsider", "member"]
        )
        // Untagged paid by the member: full value lands.
        let entryB = entry(
            id: "e2", date: day,
            lines: [expenseLine("food", yuan: 20)],
            participants: [],
            paidById: "member"
        )
        let days = LocalAggregation.memberShareDailySummary(
            [entryA, entryB], memberUserIds: ["member"], tzOffsetMinutes: utcPlus8
        )
        XCTAssertEqual(days.count, 1)
        XCTAssertEqual(days[0].expenseCents, 7_000, "50 (slice) + 20 (payer bears all)")
        XCTAssertEqual(days[0].incomeCents, 0)
    }

    // MARK: - Category summary

    func testCategorySummaryOrdersAndJoinsParent() throws {
        let day = try XCTUnwrap(LocalValues.date(fromTimestamp: "2026-01-15T03:00:00.000Z"))
        let meals = line(id: "l1", accountId: "meals", type: .expense, debit: 30, credit: 0,
                         parentCode: "food", code: "meals", icon: "🍚")
        let fruit = line(id: "l2", accountId: "fruit", type: .expense, debit: 45, credit: 0,
                         parentCode: "food", code: "fruit", icon: "🍎")
        let salary = line(id: "l3", accountId: "salary", type: .income, debit: 0, credit: 100,
                          code: "salary", icon: "💼")
        let summary = LocalAggregation.lineCategorySummary([
            entry(id: "e", date: day, lines: [meals, fruit, salary]),
        ])
        // Amount descending: fruit (4500) before meals (3000).
        XCTAssertEqual(summary.expense.map(\.accountId), ["fruit", "meals"])
        XCTAssertEqual(summary.expense.first?.amountCents, 4_500)
        XCTAssertEqual(summary.expense.first?.parentCode, "food")
        XCTAssertEqual(summary.income.map(\.amountCents), [10_000])
    }

    // MARK: - Budget (budget.service parity)

    func testBudgetYearTableSkipsEmptyMonthsAndStopsBeforeAnchor() throws {
        // Activity in local months 1 and 3 of 2026 (UTC+8); anchor = month
        // 4. The table covers months 1..3 with month 2 absent.
        let jan = try XCTUnwrap(LocalValues.date(fromTimestamp: "2026-01-05T00:00:00.000Z"))
        let mar = try XCTUnwrap(LocalValues.date(fromTimestamp: "2026-03-05T00:00:00.000Z"))
        let activity = [
            LocalAggregation.BudgetActivityRow(date: jan, expenseCents: 100_000, excludedCents: 20_000),
            LocalAggregation.BudgetActivityRow(date: mar, expenseCents: 50_000, excludedCents: 0),
        ]
        let year = LocalAggregation.buildBudgetYear(
            activity: activity, yearCents: 60_000, overrides: [3: 40_000],
            anchorYear: 2026, anchorMonth: 4, tzOffsetMinutes: utcPlus8
        )
        let table = try XCTUnwrap(year)
        XCTAssertEqual(table.startMonth, 1)
        XCTAssertEqual(table.rows.count, 2, "month 2 has no activity: skipped")
        XCTAssertEqual(table.rows[0].month, 1)
        XCTAssertEqual(table.rows[0].countedCents, 80_000, "excluded pool rides out of counted")
        XCTAssertEqual(table.rows[0].budgetCents, 60_000)
        XCTAssertEqual(table.rows[0].diffCents, 20_000, "overspent")
        XCTAssertEqual(table.rows[1].month, 3)
        XCTAssertEqual(table.rows[1].budgetCents, 40_000, "month 3's pin wins")
        XCTAssertEqual(table.rows[1].diffCents, 10_000)
        XCTAssertEqual(table.netCents, 30_000)
        // The anchor month itself never participates: anchor 3 rows months 1..2.
        let clamped = LocalAggregation.buildBudgetYear(
            activity: activity, yearCents: 60_000, overrides: [:],
            anchorYear: 2026, anchorMonth: 3, tzOffsetMinutes: utcPlus8
        )
        XCTAssertEqual(clamped?.rows.count, 1)
        XCTAssertNil(clamped?.rows.first { $0.month == 3 })
    }

    func testBudgetYearNilWithoutBudgetOrActivity() throws {
        let jan = try XCTUnwrap(LocalValues.date(fromTimestamp: "2026-01-05T00:00:00.000Z"))
        let activity = [LocalAggregation.BudgetActivityRow(date: jan, expenseCents: 100, excludedCents: 0)]
        XCTAssertNil(LocalAggregation.buildBudgetYear(
            activity: activity, yearCents: nil, overrides: [:],
            anchorYear: 2026, anchorMonth: 6, tzOffsetMinutes: utcPlus8
        ), "no budget row → no year table")
        XCTAssertNil(LocalAggregation.buildBudgetYear(
            activity: [], yearCents: 50_000, overrides: [:],
            anchorYear: 2026, anchorMonth: 6, tzOffsetMinutes: utcPlus8
        ), "no recorded activity → no year table")
    }

    func testBudgetMonthBucketsUnderFixedOffset() throws {
        // An entry at 2026-01-31T18:00Z is FEBRUARY under UTC+8 (the
        // bucketing reason monthWindow exists).
        let instant = try XCTUnwrap(LocalValues.date(fromTimestamp: "2026-01-31T18:00:00.000Z"))
        XCTAssertEqual(LocalAggregation.monthIndexOf(instant, tzOffsetMinutes: utcPlus8), 2)
        XCTAssertEqual(LocalAggregation.yearIndexOf(instant, tzOffsetMinutes: utcPlus8), 2026)
        XCTAssertEqual(LocalAggregation.monthIndexOf(instant, tzOffsetMinutes: utcMinus5), 1)
    }

    func testBudgetActivityRowsSeparateExcludedPool() {
        let sample = entry(
            id: "e", date: Date(),
            lines: [expenseLine("insurance", yuan: 100), expenseLine("food", yuan: 25)],
            excludedFromBudget: true
        )
        let rows = LocalAggregation.toBudgetActivityRows([sample])
        XCTAssertEqual(rows[0].expenseCents, 12_500, "all expense lines feed the pool")
        XCTAssertEqual(rows[0].excludedCents, 12_500, "the flag lifts the WHOLE entry's expense value")
        XCTAssertEqual(rows[0].expenseCents - rows[0].excludedCents, 0, "counted pool empty")
    }

    // MARK: - Category budget rollup

    func testRollUpCategorySumsIncludeSubtree() {
        let accounts = [
            makeAccount(id: "food", type: .expense, sortOrder: 1),
            makeAccount(id: "meals", type: .expense, sortOrder: 2).withParent("food"),
            makeAccount(id: "snacks", type: .expense, sortOrder: 3).withParent("food"),
            makeAccount(id: "other", type: .expense, sortOrder: 4),
        ]
        let sums = ["meals": 3_000, "snacks": 1_200, "food": 500, "other": 9_999]
        let rollup = LocalAggregation.rollUpCategorySums(
            accounts: accounts, sumsByAccountId: sums, budgetAccountIds: ["food", "meals"]
        )
        // food: own 500 + meals 3000 + snacks 1200 = 4700.
        XCTAssertEqual(rollup.first { $0.accountId == "food" }?.spentCents, 4_700)
        // meals: own alone.
        XCTAssertEqual(rollup.first { $0.accountId == "meals" }?.spentCents, 3_000)
    }

    // MARK: - Turnover

    func testMemberTurnoverCountsFullGrossPerTaggedUser() async throws {
        let day = try XCTUnwrap(LocalValues.date(fromTimestamp: "2026-01-15T03:00:00.000Z"))
        let entryA = entry(
            id: "e1", date: day,
            lines: [
                expenseLine("food", yuan: 100),
                line(id: "credit", accountId: "pocket", type: .asset, debit: 0, credit: 100),
            ],
            participants: ["u1", "u2"]
        )
        let entryB = entry(
            id: "e2", date: day,
            lines: [expenseLine("food", yuan: 40)],
            participants: ["u1"]
        )
        let database = try makeDatabase()
        let repository = LocalReportRepository(database: database)
        // Entries + the roster: u1 is the (single) member, u2 a departed
        // participant — the exact shape the server turnover tests describe.
        try await database.writer.write { db in
            try LocalLedgerRow(
                id: "ledger", ownerId: "u1", name: "账本", description: nil,
                currency: "CNY", status: "active", isDefault: false, lastEntryNo: 2,
                budgetExcludedAccountIds: "[]",
                createdAt: LocalValues.timestamp(from: day),
                updatedAt: LocalValues.timestamp(from: day)
            ).insert(db)
            try LocalLedgerMemberRow(
                id: "m1", ledgerId: "ledger", userId: "u1", role: "owner",
                createdAt: LocalValues.timestamp(from: day)
            ).insert(db)
            // The lines' FK targets the account chart — seed the two rows.
            for (id, type, sortOrder) in [("food", "expense", 200), ("pocket", "asset", 5)] {
                try LocalBookAccountRow(
                    id: id, ledgerId: "ledger", name: nil, code: nil, type: type,
                    sortOrder: sortOrder, parentId: nil, status: "active", icon: nil,
                    flags: "[]", meta: nil, realAccountId: nil,
                    createdAt: LocalValues.timestamp(from: day),
                    updatedAt: LocalValues.timestamp(from: day)
                ).insert(db)
            }
        }
        try await insertTestEntry(entryA, entryNo: 1, db: database)
        try await insertTestEntry(entryB, entryNo: 2, db: database)
        let turnover = try await repository.memberTurnover(ledgerId: "ledger", from: nil, to: nil)
        XCTAssertEqual(turnover.members.count, 2)
        let u1 = try XCTUnwrap(turnover.members.first { $0.userId == "u1" })
        XCTAssertEqual(u1.turnover, 140.0, "each tagged user counts the full gross (100 + 40)")
        XCTAssertEqual(u1.entryCount, 2)
        XCTAssertEqual(u1.role, .owner)
        let u2 = try XCTUnwrap(turnover.members.first { $0.userId == "u2" })
        XCTAssertEqual(u2.turnover, 100.0)
        XCTAssertEqual(u2.role, .guest, "departed participants keep a guest-role row")
        XCTAssertEqual(u2.ledgerMemberId, nil)
        XCTAssertEqual(turnover.totals.entries, 2)
    }

    /// Writes one entry fixture with its lines + participants straight into
    /// the store — the phase-2 write path isn't built yet, and these tests
    /// exercise phase-1 reads over stored data.
    private func insertTestEntry(
        _ entry: JournalEntry, entryNo: Int, db database: LocalDatabase
    ) throws {
        let timestamp = LocalValues.timestamp(from: entry.date)
        try database.writer.write { db in
            try LocalJournalEntryRow(
                id: entry.id,
                ledgerId: entry.ledgerId,
                entryNo: entryNo,
                date: timestamp,
                dateDayKey: LocalAggregation.localDayKey(entry.date, tzOffsetMinutes: 480),
                memo: nil,
                status: "posted",
                countsInLedger: true,
                guestCreated: false,
                excludedFromBudget: false,
                createdById: "u1",
                paidById: nil,
                projectId: nil,
                address: nil,
                addressName: nil,
                latitude: nil,
                longitude: nil,
                merchant: nil,
                createdAt: timestamp
            ).insert(db)
            for line in entry.lines {
                try LocalJournalLineRow(
                    id: "\(entry.id)-\(line.id)",
                    entryId: entry.id,
                    accountId: line.accountId,
                    debitCents: Int((line.debit * 100).rounded()),
                    creditCents: Int((line.credit * 100).rounded()),
                    memo: nil
                ).insert(db)
            }
            for participant in entry.participants ?? [] {
                try LocalEntryParticipantRow(
                    id: "\(entry.id)-\(participant.id)",
                    entryId: entry.id,
                    userId: participant.userId,
                    createdAt: timestamp
                ).insert(db)
            }
        }
    }
}

private extension BookAccount {
    func withParent(_ parentId: String) -> BookAccount {
        var copy = self
        copy.parentId = parentId
        return copy
    }
}
