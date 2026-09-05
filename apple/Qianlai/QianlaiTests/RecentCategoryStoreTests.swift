//
//  RecentCategoryStoreTests.swift
//  QianlaiTests
//
//  Created by Lisiur Day on 2026/9/5.
//

import XCTest
@testable import Qianlai

final class RecentCategoryStoreTests: XCTestCase {
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: "RecentCategoryStoreTests")
        defaults.removePersistentDomain(forName: "RecentCategoryStoreTests")
    }

    func testEmptyByDefault() {
        XCTAssertTrue(RecentCategoryStore.ids(ledgerId: "l1", kind: .expense, defaults: defaults).isEmpty)
    }

    func testRecordMovesToFrontAndDeduplicates() {
        RecentCategoryStore.record("a", ledgerId: "l1", kind: .expense, defaults: defaults)
        RecentCategoryStore.record("b", ledgerId: "l1", kind: .expense, defaults: defaults)
        RecentCategoryStore.record("a", ledgerId: "l1", kind: .expense, defaults: defaults)
        XCTAssertEqual(
            RecentCategoryStore.ids(ledgerId: "l1", kind: .expense, defaults: defaults),
            ["a", "b"]
        )
    }

    func testKindsAreScopedSeparately() {
        RecentCategoryStore.record("a", ledgerId: "l1", kind: .expense, defaults: defaults)
        XCTAssertTrue(RecentCategoryStore.ids(ledgerId: "l1", kind: .income, defaults: defaults).isEmpty)
        XCTAssertTrue(RecentCategoryStore.ids(ledgerId: "l2", kind: .expense, defaults: defaults).isEmpty)
    }

    func testCapTrimsOldest() {
        for index in 0..<12 {
            RecentCategoryStore.record(
                "c\(index)",
                ledgerId: "l1",
                kind: .expense,
                defaults: defaults
            )
        }
        // Default cap: at most 6 recents survive.
        XCTAssertEqual(
            RecentCategoryStore.ids(ledgerId: "l1", kind: .expense, defaults: defaults),
            ["c11", "c10", "c9", "c8", "c7", "c6"]
        )
    }
}
