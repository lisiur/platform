//
//  JournalStoreTests.swift
//  QianlaiTests
//
//  Exercises the pure window arithmetic of JournalStore — the paged
//  loaded-window refresh plan and the day-slice splice the day-scoped
//  edit refresh is built on. The network paths themselves stay
//  untestable (APIClient.shared is not injectable).
//

import XCTest
@testable import Qianlai

final class JournalStoreTests: XCTestCase {
    private func entry(_ id: String, day: Date, entryNo: Int = 0) -> JournalEntry {
        JournalEntry(
            id: id,
            ledgerId: "ledger",
            entryNo: entryNo,
            date: day,
            memo: nil,
            status: "posted",
            countsInLedger: true,
            guestCreated: false,
            createdById: nil,
            createdBy: nil,
            paidById: nil,
            paidBy: nil,
            createdAt: day,
            projectId: nil,
            project: nil,
            location: nil,
            lines: [],
            participants: nil,
            memberSharesCents: nil
        )
    }

    private func day(_ year: Int, _ month: Int, _ dayOfMonth: Int) -> Date {
        Calendar.current.date(from: DateComponents(year: year, month: month, day: dayOfMonth))!
    }

    // MARK: windowReloadPlan

    func testWindowReloadPlanColdListUsesOnePageSizeRequest() {
        let plan = JournalStore.windowReloadPlan(loadedCount: 0, pageSize: 20, pageCap: 100)
        XCTAssertEqual(plan.map(\.offset), [0])
        XCTAssertEqual(plan.map(\.limit), [20])
    }

    func testWindowReloadPlanSinglePageStaysAtLoadedCount() {
        for loaded in [1, 20, 45, 100] {
            let plan = JournalStore.windowReloadPlan(loadedCount: loaded, pageSize: 20, pageCap: 100)
            XCTAssertEqual(plan.count, 1, "loaded \(loaded)")
            XCTAssertEqual(plan[0].offset, 0)
            // The pageSize floor backfills a near-cold list to one ordinary
            // full-page request instead of a tiny one.
            XCTAssertEqual(plan[0].limit, max(20, loaded), "loaded \(loaded)")
        }
    }

    func testWindowReloadPlanDeepSessionPagesByCapWithPartialTail() {
        let plan = JournalStore.windowReloadPlan(loadedCount: 250, pageSize: 20, pageCap: 100)
        XCTAssertEqual(plan.map(\.offset), [0, 100, 200])
        XCTAssertEqual(plan.map(\.limit), [100, 100, 50])
    }

    // MARK: replacingDay

    func testReplacingDayReplacesTheDaysContiguousSlice() {
        let d10 = day(2026, 9, 10)
        let d12 = day(2026, 9, 12)
        let list = [entry("a", day: d10), entry("b", day: d10), entry("c", day: d12)]
        let fetched = [entry("x", day: d10), entry("y", day: d10)]

        let result = JournalStore.replacingDay(list, day: d10, with: fetched)

        XCTAssertEqual(result.map(\.id), ["x", "y", "c"])
    }

    func testReplacingDayWithEmptyRowsRemovesTheDay() {
        let d10 = day(2026, 9, 10)
        let d12 = day(2026, 9, 12)
        let list = [entry("a", day: d10), entry("c", day: d12)]

        let result = JournalStore.replacingDay(list, day: d10, with: [])

        XCTAssertEqual(result.map(\.id), ["c"])
    }

    func testReplacingDayInsertsANewerDayAtTheTop() {
        let d10 = day(2026, 9, 10)
        let d15 = day(2026, 9, 15)
        let list = [entry("a", day: d10)]
        let fetched = [entry("x", day: d15)]

        let result = JournalStore.replacingDay(list, day: d15, with: fetched)

        XCTAssertEqual(result.map(\.id), ["x", "a"])
    }

    func testReplacingDayInsertsBetweenExistingDays() {
        let d10 = day(2026, 9, 10)
        let d4 = day(2026, 9, 4)
        let d7 = day(2026, 9, 7)
        let list = [entry("a", day: d10), entry("b", day: d4)]
        let fetched = [entry("x", day: d7)]

        let result = JournalStore.replacingDay(list, day: d7, with: fetched)

        XCTAssertEqual(result.map(\.id), ["a", "x", "b"])
    }

    func testReplacingDayAppendsADayOlderThanEverythingLoaded() {
        let d10 = day(2026, 9, 10)
        let d2 = day(2026, 9, 2)
        let list = [entry("a", day: d10)]
        let fetched = [entry("x", day: d2)]

        let result = JournalStore.replacingDay(list, day: d2, with: fetched)

        XCTAssertEqual(result.map(\.id), ["a", "x"])
    }

    func testReplacingDayWithNoExistingRowsAndEmptyFetchIsANoOp() {
        let d10 = day(2026, 9, 10)
        let list = [entry("a", day: d10)]

        let result = JournalStore.replacingDay(list, day: day(2026, 9, 1), with: [])

        XCTAssertEqual(result.map(\.id), ["a"])
    }

    // MARK: editRefreshTargets

    func testEditRefreshTargetsSameDayFetchesOneDay() {
        let d10 = day(2026, 9, 10)

        let targets = JournalStore.editRefreshTargets(
            oldDay: d10,
            newDay: d10,
            oldestLoadedDay: d10,
            fromDate: nil,
            toDate: nil
        )

        XCTAssertEqual(targets, [d10])
    }

    func testEditRefreshTargetsMovedDayFetchesBoth() {
        let d8 = day(2026, 9, 8)
        let d10 = day(2026, 9, 10)
        let d12 = day(2026, 9, 12)

        let targets = JournalStore.editRefreshTargets(
            oldDay: d10,
            newDay: d8,
            oldestLoadedDay: d8,
            fromDate: nil,
            toDate: nil
        )

        XCTAssertEqual(targets, [d10, d8])
    }

    func testEditRefreshTargetsSkipsNewDayBelowTheLoadedWindow() {
        let d8 = day(2026, 9, 8)
        let d10 = day(2026, 9, 10)
        let d12 = day(2026, 9, 12)

        let targets = JournalStore.editRefreshTargets(
            oldDay: d12,
            newDay: d8,
            oldestLoadedDay: d10,
            fromDate: nil,
            toDate: nil
        )

        XCTAssertEqual(targets, [d12])
    }

    func testEditRefreshTargetsKeepsNewDayAtTheLoadedWindowEdge() {
        let d8 = day(2026, 9, 8)
        let d12 = day(2026, 9, 12)

        let targets = JournalStore.editRefreshTargets(
            oldDay: d12,
            newDay: d8,
            oldestLoadedDay: d8,
            fromDate: nil,
            toDate: nil
        )

        XCTAssertEqual(targets, [d12, d8])
    }

    func testEditRefreshTargetsSkipsNewDayOutsideTheDateRange() {
        let sep1 = day(2026, 9, 1)
        let sep7 = day(2026, 9, 7)
        let sep10 = day(2026, 9, 10)
        let sep20 = day(2026, 9, 20)

        let before = JournalStore.editRefreshTargets(
            oldDay: sep7,
            newDay: sep20,
            oldestLoadedDay: sep1,
            fromDate: sep1,
            toDate: sep7
        )
        XCTAssertEqual(before, [sep7], "a day after the range's end is dropped")

        let after = JournalStore.editRefreshTargets(
            oldDay: sep7,
            newDay: sep1,
            oldestLoadedDay: sep1,
            fromDate: sep7,
            toDate: sep10
        )
        XCTAssertEqual(after, [sep7], "a day before the range's start is dropped")

        let onEdge = JournalStore.editRefreshTargets(
            oldDay: sep10,
            newDay: sep1,
            oldestLoadedDay: sep1,
            fromDate: sep1,
            toDate: sep10
        )
        XCTAssertEqual(onEdge, [sep10, sep1], "the range's own end day stays visible")
    }
}
