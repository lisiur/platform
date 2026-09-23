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

    func testDrillAccountAxesJoinTheQueryAndSplitTheKey() {
        // The drill-down pages' category scope rides the chart push: a
        // chart page opened from a category drill fetches THAT category's
        // stats (the rollup axis buckets the category's children
        // server-side). Off — every non-drill surface — sends neither
        // pair, so the shipped wire shape is untouched.
        let leaf = ApiQuery.build(
            StatsStore.baseQueryPairs(
                window: window,
                filters: StatsFilters(participantUserId: nil, projectId: nil, accountId: "acc-leaf")
            )
        )
        XCTAssertTrue(leaf.contains("accountId=acc-leaf"), leaf)
        let rollup = ApiQuery.build(
            StatsStore.baseQueryPairs(
                window: window,
                filters: StatsFilters(participantUserId: nil, projectId: nil, parentAccountId: "acc-parent")
            )
        )
        XCTAssertTrue(rollup.contains("parentAccountId=acc-parent"), rollup)
        let off = ApiQuery.build(
            StatsStore.baseQueryPairs(
                window: window,
                filters: StatsFilters(participantUserId: nil, projectId: nil)
            )
        )
        XCTAssertFalse(off.contains("accountId"), off)
        XCTAssertFalse(off.contains("parentAccountId"), off)
        // And each narrowed record lives under its own cache key.
        let plain = StatsStore.snapshotKey(ledgerId: "led", window: window, filters: nil)
        XCTAssertNotEqual(
            plain,
            StatsStore.snapshotKey(
                ledgerId: "led", window: window,
                filters: StatsFilters(participantUserId: nil, projectId: nil, accountId: "acc-leaf")
            )
        )
        XCTAssertNotEqual(
            plain,
            StatsStore.snapshotKey(
                ledgerId: "led", window: window,
                filters: StatsFilters(participantUserId: nil, projectId: nil, parentAccountId: "acc-parent")
            )
        )
    }

    func testCategoryLabelNeverEntersTheWireOrTheKey() {
        // The label is display-only (a page that inherits its category
        // through the capture titles itself with it) — captures differing
        // only in label must stay the same wire shape and the same cache
        // record.
        let plain = StatsFilters(participantUserId: nil, projectId: nil, accountId: "acc-leaf")
        var labeled = plain
        labeled.categoryLabel = "餐饮"
        XCTAssertEqual(
            ApiQuery.build(plain.queryPairs),
            ApiQuery.build(labeled.queryPairs)
        )
        XCTAssertEqual(
            StatsFilters.keySegment(plain),
            StatsFilters.keySegment(labeled)
        )
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

    // MARK: capture

    @MainActor
    func testCaptureCarriesDrillAccountAxesAndStaysNilWithoutThem() {
        // The one live capture every host reads. The drill axes ride it —
        // only a drill-down's private store ever sets them, so a chart
        // page pushed from a drill inherits the category — while a store
        // without them (journal/dashboard: no UI touches account axes)
        // still collapses to nil, keeping every existing capture and
        // cache key byte-identical.
        let store = JournalStore()
        XCTAssertNil(store.statsFilters, "a bare store captures nil")
        store.accountId = "acc-leaf"
        store.parentAccountId = "acc-parent"
        let captured = store.statsFilters
        XCTAssertEqual(captured?.accountId, "acc-leaf")
        XCTAssertEqual(captured?.parentAccountId, "acc-parent")
    }
}
