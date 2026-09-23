//
//  StatsStoreTests.swift
//  QianlaiTests
//
//  Exercises the stats component's pure query shaping — the wire pairs
//  every stats request carries (window, filters, numerator) and the
//  snapshot-cache key's filter segment. The fetch paths themselves stay
//  untestable (APIClient.shared is not injectable).
//

import XCTest
@testable import Qianlai

final class StatsStoreTests: XCTestCase {
    /// A fixed June 2027 month so the key/pair assertions never drift
    /// with the clock.
    private let window = MonthWindow(
        from: Date(timeIntervalSince1970: 1_814_313_600),
        to: Date(timeIntervalSince1970: 1_816_902_399)
    )

    // MARK: baseQueryPairs

    func testUnfilteredQueryIsTheShippedShape() {
        // The unfiltered shape: window pairs plus the members numerator, in
        // that order — daily/category requests stay byte-identical to the
        // pre-filter era, and the overview's only delta is now declaring
        // that same numerator explicitly (the server's default anyway).
        let pairs = StatsStore.baseQueryPairs(window: window, filters: nil)
        XCTAssertEqual(
            ApiQuery.build(pairs),
            ApiQuery.build([
                ("from", ApiQuery.iso(window.from)),
                ("to", ApiQuery.iso(window.to)),
                ("shareMode", "members"),
            ])
        )
    }

    func testParticipantFilterJoinsTheQuery() {
        let query = ApiQuery.build(
            StatsStore.baseQueryPairs(
                window: window,
                filters: StatsFilters(participantUserId: "user-b", projectId: nil)
            )
        )
        XCTAssertTrue(query.contains("participantUserId=user-b"), query)
        XCTAssertTrue(query.contains("shareMode=members"), query)
        XCTAssertFalse(query.contains("projectId"), query)
    }

    func testProjectFilterFlipsTheNumeratorToLine() {
        // The journal day headers' rule: a project's books speak raw
        // lines, so its chart page reconciles with the rows it lists.
        let query = ApiQuery.build(
            StatsStore.baseQueryPairs(
                window: window,
                filters: StatsFilters(participantUserId: nil, projectId: "prj-a")
            )
        )
        XCTAssertTrue(query.contains("projectId=prj-a"), query)
        XCTAssertTrue(query.contains("shareMode=line"), query)
    }

    func testBudgetToggleJoinsTheQuery() {
        // The 不计预算 toggle narrows the window to entries marked
        // 不计入日常预算 — the cards must fetch the same set the list
        // shows, so the axis rides the stats request like any other.
        let on = ApiQuery.build(
            StatsStore.baseQueryPairs(
                window: window,
                filters: StatsFilters(participantUserId: nil, projectId: nil, budgetExcluded: true)
            )
        )
        XCTAssertTrue(on.contains("excludedFromBudget=true"), on)
        // Off (nil) sends nothing — the default caliber covers everything.
        let off = ApiQuery.build(
            StatsStore.baseQueryPairs(
                window: window,
                filters: StatsFilters(participantUserId: nil, projectId: nil, budgetExcluded: nil)
            )
        )
        XCTAssertFalse(off.contains("excludedFromBudget"), off)
    }

    func testKindPickJoinsTheQueryAndSplitsTheKey() {
        // The 类型 pick narrows the cards to one classified kind — the
        // same server classification the list renders by.
        let expense = StatsFilters(participantUserId: nil, projectId: nil, kind: .expense)
        let query = ApiQuery.build(
            StatsStore.baseQueryPairs(window: window, filters: expense)
        )
        XCTAssertTrue(query.contains("kind=expense"), query)
        // Off sends nothing.
        let off = ApiQuery.build(
            StatsStore.baseQueryPairs(
                window: window,
                filters: StatsFilters(participantUserId: nil, projectId: nil, kind: nil)
            )
        )
        XCTAssertFalse(off.contains("kind"), off)
        // And the narrowed record lives under its own cache key.
        let plain = StatsStore.snapshotKey(ledgerId: "led", window: window, filters: nil)
        XCTAssertNotEqual(plain, StatsStore.snapshotKey(ledgerId: "led", window: window, filters: expense))
    }

    func testNotCountedIsolationJoinsTheQueryAndSplitsTheKey() {
        // The 只看不计收支 toggle isolates entries recorded 不计收支. The
        // countsInLedger=false axis alone carries the narrowing: the
        // server lifts its ledger-activity predicate while the axis is
        // present, so no includeExcluded ride-along is sent (or needed).
        let isolated = StatsFilters(
            participantUserId: nil, projectId: nil, notCountedOnly: true
        )
        let query = ApiQuery.build(
            StatsStore.baseQueryPairs(window: window, filters: isolated)
        )
        XCTAssertTrue(query.contains("countsInLedger=false"), query)
        XCTAssertFalse(query.contains("includeExcluded"), query)
        // Off sends neither pair.
        let off = ApiQuery.build(
            StatsStore.baseQueryPairs(
                window: window,
                filters: StatsFilters(participantUserId: nil, projectId: nil, notCountedOnly: nil)
            )
        )
        XCTAssertFalse(off.contains("countsInLedger"), off)
        XCTAssertFalse(off.contains("includeExcluded"), off)
        // And the narrowed record lives under its own cache key.
        let plain = StatsStore.snapshotKey(ledgerId: "led", window: window, filters: nil)
        XCTAssertNotEqual(plain, StatsStore.snapshotKey(ledgerId: "led", window: window, filters: isolated))
    }

    // MARK: snapshotKey

    func testUnfilteredKeyIgnoresEmptyFilters() {
        let plain = StatsStore.snapshotKey(ledgerId: "led", window: window, filters: nil)
        let empty = StatsStore.snapshotKey(
            ledgerId: "led",
            window: window,
            filters: StatsFilters(participantUserId: nil, projectId: nil)
        )
        XCTAssertEqual(plain, empty, "an empty capture must not fork the ledger's record")
    }

    func testFilteredKeysSeparateFromTheLedgerRecord() {
        let plain = StatsStore.snapshotKey(ledgerId: "led", window: window, filters: nil)
        let participant = StatsStore.snapshotKey(
            ledgerId: "led",
            window: window,
            filters: StatsFilters(participantUserId: "user-b", projectId: nil)
        )
        let project = StatsStore.snapshotKey(
            ledgerId: "led",
            window: window,
            filters: StatsFilters(participantUserId: nil, projectId: "prj-a")
        )
        let budget = StatsStore.snapshotKey(
            ledgerId: "led",
            window: window,
            filters: StatsFilters(participantUserId: nil, projectId: nil, budgetExcluded: true)
        )
        XCTAssertNotEqual(plain, participant)
        XCTAssertNotEqual(plain, project)
        XCTAssertNotEqual(plain, budget, "a budget-narrowed record must never read as the ledger's")
        XCTAssertNotEqual(participant, project)
        XCTAssertNotEqual(participant, budget)
        XCTAssertNotEqual(project, budget)

        // Same filters, same key — hydration is stable across remounts.
        let again = StatsStore.snapshotKey(
            ledgerId: "led",
            window: window,
            filters: StatsFilters(participantUserId: "user-b", projectId: nil)
        )
        XCTAssertEqual(participant, again)
    }
}
