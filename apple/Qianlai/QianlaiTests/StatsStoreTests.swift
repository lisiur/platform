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
        XCTAssertNotEqual(plain, participant)
        XCTAssertNotEqual(plain, project)
        XCTAssertNotEqual(participant, project)

        // Same filters, same key — hydration is stable across remounts.
        let again = StatsStore.snapshotKey(
            ledgerId: "led",
            window: window,
            filters: StatsFilters(participantUserId: "user-b", projectId: nil)
        )
        XCTAssertEqual(participant, again)
    }
}
