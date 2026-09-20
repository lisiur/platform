//
//  SnapshotCacheTests.swift
//  QianlaiTests
//
//  Exercises the snapshot cache's envelope rules (schema drift and
//  corrupted data read as a miss), the per-namespace LRU eviction, and
//  the sign-out sweep — plus the JournalStore snapshot-key signature:
//  same filters, same key; any filter movement, new key.
//

import XCTest
@testable import Qianlai

final class SnapshotCacheTests: XCTestCase {
    private var defaults: UserDefaults!

    override func setUpWithError() throws {
        try super.setUpWithError()
        defaults = UserDefaults(suiteName: "SnapshotCacheTests")
        defaults.removePersistentDomain(forName: "SnapshotCacheTests")
    }

    private struct Sample: Codable, Equatable {
        var name: String
        var count: Int
    }

    private static let sample = Sample(name: "午餐", count: 3)

    // MARK: roundtrip & misses

    func testRoundtrip() {
        SnapshotCache.write("ns", key: "a", schema: 1, payload: Self.sample, defaults: defaults)
        let read: Sample? = SnapshotCache.read("ns", key: "a", schema: 1, as: Sample.self, defaults: defaults)
        XCTAssertEqual(read, Self.sample)
    }

    func testSchemaMismatchReadsAsMiss() {
        SnapshotCache.write("ns", key: "a", schema: 1, payload: Self.sample, defaults: defaults)
        let read: Sample? = SnapshotCache.read("ns", key: "a", schema: 2, as: Sample.self, defaults: defaults)
        XCTAssertNil(read)
    }

    func testCorruptedDataReadsAsMiss() {
        defaults.set(Data("not json".utf8), forKey: "snapshot.ns.a")
        let read: Sample? = SnapshotCache.read("ns", key: "a", schema: 1, as: Sample.self, defaults: defaults)
        XCTAssertNil(read)
    }

    func testMissingKeyReadsAsMiss() {
        let read: Sample? = SnapshotCache.read("ns", key: "absent", schema: 1, as: Sample.self, defaults: defaults)
        XCTAssertNil(read)
    }

    func testNamespacesAreIsolated() {
        SnapshotCache.write("one", key: "k", schema: 1, payload: Self.sample, defaults: defaults)
        let read: Sample? = SnapshotCache.read("two", key: "k", schema: 1, as: Sample.self, defaults: defaults)
        XCTAssertNil(read)
    }

    // MARK: LRU eviction

    func testPruneEvictsLeastRecentBeyondCap() {
        for i in 0..<5 {
            SnapshotCache.write("lru", key: "k\(i)", schema: 1, payload: Self.sample, cap: 3, defaults: defaults)
        }
        // k0 and k1 were written first — evicted; k2..k4 survive.
        for (key, expected) in [("k0", false), ("k1", false), ("k2", true), ("k3", true), ("k4", true)] {
            let read: Sample? = SnapshotCache.read("lru", key: key, schema: 1, as: Sample.self, defaults: defaults)
            XCTAssertEqual(read != nil, expected, "key \(key)")
        }
    }

    func testRewritePromotesKeyToFrontOfLRU() {
        for i in 0..<3 {
            SnapshotCache.write("lru2", key: "k\(i)", schema: 1, payload: Self.sample, cap: 3, defaults: defaults)
        }
        // Rewriting the oldest key pins it; the next write evicts k1 instead.
        SnapshotCache.write("lru2", key: "k0", schema: 1, payload: Self.sample, cap: 3, defaults: defaults)
        SnapshotCache.write("lru2", key: "k3", schema: 1, payload: Self.sample, cap: 3, defaults: defaults)
        XCTAssertNotNil(SnapshotCache.read("lru2", key: "k0", schema: 1, as: Sample.self, defaults: defaults) as Sample?)
        XCTAssertNil(SnapshotCache.read("lru2", key: "k1", schema: 1, as: Sample.self, defaults: defaults) as Sample?)
        XCTAssertNotNil(SnapshotCache.read("lru2", key: "k2", schema: 1, as: Sample.self, defaults: defaults) as Sample?)
    }

    // MARK: clearAll

    func testClearAllSweepsSnapshotsButLeavesForeignKeys() {
        SnapshotCache.write("ns", key: "a", schema: 1, payload: Self.sample, defaults: defaults)
        defaults.set("keep me", forKey: "unrelated.key")
        SnapshotCache.clearAll(defaults: defaults)
        let read: Sample? = SnapshotCache.read("ns", key: "a", schema: 1, as: Sample.self, defaults: defaults)
        XCTAssertNil(read)
        XCTAssertEqual(defaults.string(forKey: "unrelated.key"), "keep me")
    }

    // MARK: Namespace binding

    func testNamespaceBindingRoundtripAndSchemaMiss() {
        let bound = SnapshotCache.namespace("bound", schema: 4)
        bound.write(key: "k", payload: Self.sample, defaults: defaults)
        XCTAssertEqual(bound.read(key: "k", as: Sample.self, defaults: defaults), Self.sample)
        // A different schema version on the same namespace reads as a miss.
        let bumped = SnapshotCache.namespace("bound", schema: 5)
        XCTAssertNil(bumped.read(key: "k", as: Sample.self, defaults: defaults) as Sample?)
    }

    // MARK: JournalStore sort tokens

    func testSortQueryTokensSingleEncoding() {
        // The one mapping both the list request and the snapshot key
        // derive from — pin all three cases.
        let date = JournalStore.sortQueryTokens(.date)
        XCTAssertNil(date.name)
        XCTAssertNil(date.order)
        let descending = JournalStore.sortQueryTokens(.amountDescending)
        XCTAssertEqual(descending.name, "amount")
        XCTAssertEqual(descending.order, "desc")
        let ascending = JournalStore.sortQueryTokens(.amountAscending)
        XCTAssertEqual(ascending.name, "amount")
        XCTAssertEqual(ascending.order, "asc")
    }

    // MARK: ReportStore / ProjectStore key signatures

    func testReportBudgetKeySeparatesLedgersAndMonths() {
        let base = ReportStore.budgetKey(ledgerId: "l1", month: YearMonth(year: 2026, month: 9))
        XCTAssertEqual(base, ReportStore.budgetKey(ledgerId: "l1", month: YearMonth(year: 2026, month: 9)))
        XCTAssertNotEqual(base, ReportStore.budgetKey(ledgerId: "l1", month: YearMonth(year: 2026, month: 10)))
        XCTAssertNotEqual(base, ReportStore.budgetKey(ledgerId: "l2", month: YearMonth(year: 2026, month: 9)))
    }

    func testReportWindowKeySeparatesWindowsAndNames() {
        let day = Date(timeIntervalSince1970: 1_000)
        let allTime = ReportStore.windowKey("trial", ledgerId: "l1", from: nil, to: nil)
        // The all-time request and any windowed request never share a key,
        // and the three report names never collide on the same window.
        XCTAssertNotEqual(allTime, ReportStore.windowKey("trial", ledgerId: "l1", from: nil, to: day))
        XCTAssertNotEqual(
            ReportStore.windowKey("trial", ledgerId: "l1", from: nil, to: day),
            ReportStore.windowKey("statement", ledgerId: "l1", from: nil, to: day)
        )
        XCTAssertEqual(
            ReportStore.windowKey("turnover", ledgerId: "l1", from: day, to: nil),
            ReportStore.windowKey("turnover", ledgerId: "l1", from: day, to: nil)
        )
    }

    func testProjectKeysSeparateLedgersAndProjects() {
        XCTAssertEqual(ProjectStore.listKey(ledgerId: "l1"), ProjectStore.listKey(ledgerId: "l1"))
        XCTAssertNotEqual(ProjectStore.listKey(ledgerId: "l1"), ProjectStore.listKey(ledgerId: "l2"))
        let report = ProjectStore.reportKey(ledgerId: "l1", projectId: "p1")
        XCTAssertEqual(report, ProjectStore.reportKey(ledgerId: "l1", projectId: "p1"))
        XCTAssertNotEqual(report, ProjectStore.reportKey(ledgerId: "l1", projectId: "p2"))
        XCTAssertNotEqual(report, ProjectStore.listKey(ledgerId: "l1"))
    }

    // MARK: JournalStore snapshot key

    private func journalPairs(
        q: String? = nil,
        kind: String? = nil,
        project: String? = nil
    ) -> [(String, String?)] {
        [("q", q), ("from", nil), ("to", nil), ("projectId", project), ("kind", kind)]
    }

    func testSameFiltersProduceSameKey() {
        let a = JournalStore.snapshotKey(
            ledgerId: "l1", queryPairs: journalPairs(q: "coffee"), sort: .date, includeExcluded: true
        )
        let b = JournalStore.snapshotKey(
            ledgerId: "l1", queryPairs: journalPairs(q: "coffee"), sort: .date, includeExcluded: true
        )
        XCTAssertEqual(a, b)
    }

    func testAnyFilterMovementProducesNewKey() {
        let base = JournalStore.snapshotKey(
            ledgerId: "l1", queryPairs: journalPairs(), sort: .date, includeExcluded: true
        )
        XCTAssertNotEqual(
            base,
            JournalStore.snapshotKey(
                ledgerId: "l1", queryPairs: journalPairs(kind: "expense"), sort: .date, includeExcluded: true
            )
        )
        XCTAssertNotEqual(
            base,
            JournalStore.snapshotKey(
                ledgerId: "l1", queryPairs: journalPairs(project: "p1"), sort: .date, includeExcluded: true
            )
        )
        XCTAssertNotEqual(
            base,
            JournalStore.snapshotKey(
                ledgerId: "l1", queryPairs: journalPairs(), sort: .amountDescending, includeExcluded: true
            )
        )
        XCTAssertNotEqual(
            base,
            JournalStore.snapshotKey(
                ledgerId: "l1", queryPairs: journalPairs(), sort: .date, includeExcluded: false
            )
        )
        XCTAssertNotEqual(
            base,
            JournalStore.snapshotKey(
                ledgerId: "l2", queryPairs: journalPairs(), sort: .date, includeExcluded: true
            )
        )
    }

    func testNilAndEmptyQueryFoldToSameKey() {
        // The wire encoding drops nil and empty values — the key must fold
        // the same way or an untouched search field would fork the cache.
        let withEmpty = JournalStore.snapshotKey(
            ledgerId: "l1", queryPairs: [("q", "")], sort: .date, includeExcluded: true
        )
        let withNil = JournalStore.snapshotKey(
            ledgerId: "l1", queryPairs: [("q", nil)], sort: .date, includeExcluded: true
        )
        XCTAssertEqual(withEmpty, withNil)
    }
}
