//
//  BudgetMathTests.swift
//  QianlaiTests
//
//  Created by Lisiur Day on 2026/9/15.
//

import XCTest
@testable import Qianlai

/// Pure budget math: the FR6 status ladder, the daily-available figure, and
/// the quick-entry toggle's excluded-category default. No stores, no
/// network — the calendar comes in as a parameter so "now" is a fixture.
final class BudgetMathTests: XCTestCase {
    // MARK: - Status (FR6 / 5.3)

    func testStatusThresholds() {
        let budget = 500_000 // ¥5,000.00
        XCTAssertEqual(BudgetMath.status(countedCents: 399_999, budgetCents: budget), .normal)
        XCTAssertEqual(BudgetMath.status(countedCents: 400_000, budgetCents: budget), .near)
        XCTAssertEqual(BudgetMath.status(countedCents: 499_999, budgetCents: budget), .near)
        XCTAssertEqual(BudgetMath.status(countedCents: 500_000, budgetCents: budget), .over)
        XCTAssertEqual(BudgetMath.status(countedCents: 520_000, budgetCents: budget), .over)
    }

    func testZeroBudgetOverspendsOnFirstCountedCent() {
        // The spec's 预算为 0 edge: a valid budget that any counted spending
        // blows through — but zero spending stays normal.
        XCTAssertEqual(BudgetMath.status(countedCents: 0, budgetCents: 0), .normal)
        XCTAssertEqual(BudgetMath.status(countedCents: 1, budgetCents: 0), .over)
    }

    // MARK: - Daily available (5.2)

    func testDaysRemainingIncludesTodayThroughMonthEnd() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let day = { (year: Int, month: Int, day: Int) -> Date in
            calendar.date(from: DateComponents(year: year, month: month, day: day, hour: 15))!
        }
        // Sep 2026 has 30 days: from the 15th (inclusive) through the 30th.
        XCTAssertEqual(BudgetMath.daysRemaining(inMonthOf: day(2026, 9, 15), calendar: calendar), 16)
        XCTAssertEqual(BudgetMath.daysRemaining(inMonthOf: day(2026, 9, 30), calendar: calendar), 1)
        XCTAssertEqual(BudgetMath.daysRemaining(inMonthOf: day(2026, 9, 1), calendar: calendar), 30)
    }

    func testDailyAvailableFloorsAndNeverGoesNegative() {
        // 1000 cents over 3 days floors to 333.
        XCTAssertEqual(BudgetMath.dailyAvailableCents(remainingCents: 1000, daysRemaining: 3), 333)
        // Zero or negative remaining shows 0 (never a negative daily).
        XCTAssertEqual(BudgetMath.dailyAvailableCents(remainingCents: 0, daysRemaining: 5), 0)
        XCTAssertEqual(BudgetMath.dailyAvailableCents(remainingCents: -200, daysRemaining: 5), 0)
    }

    // MARK: - Excluded-category default (FR3/FR4/FR5)

    private func account(_ id: String, parentId: String?) -> BookAccount {
        BookAccount(
            id: id,
            ledgerId: "led-1",
            name: nil,
            code: id,
            type: .expense,
            sortOrder: 0,
            parentId: parentId,
            status: "active",
            icon: nil,
            flags: nil,
            meta: nil,
            createdAt: Date(timeIntervalSince1970: 0)
        )
    }

    func testLeafUnderExcludedParentDefaultsExcluded() {
        let accounts = [account("travel", parentId: nil), account("tickets", parentId: "travel")]
        XCTAssertTrue(BudgetMath.isExcludedByCategory(
            leafAccountId: "tickets",
            accounts: accounts,
            excludedAccountIds: ["travel"]
        ))
    }

    func testExcludedTopLevelLeafDefaultsExcluded() {
        let accounts = [account("insurance", parentId: nil)]
        XCTAssertTrue(BudgetMath.isExcludedByCategory(
            leafAccountId: "insurance",
            accounts: accounts,
            excludedAccountIds: ["insurance"]
        ))
    }

    func testExcludedSubCategoryLeafDefaultsExcluded() {
        // The exclusion list may name a sub-category directly — the walk
        // hits the leaf itself before any ancestor.
        let accounts = [account("food", parentId: nil), account("meals", parentId: "food")]
        XCTAssertTrue(BudgetMath.isExcludedByCategory(
            leafAccountId: "meals",
            accounts: accounts,
            excludedAccountIds: ["meals"]
        ))
    }

    func testAncestorOnlyWalkSkipsSelfAndDetectsParent() {
        // The picker's inherited-row test walks ancestors ONLY: the row's
        // own id in the set is an explicit pick, not an inherited one.
        let accounts = [account("food", parentId: nil), account("meals", parentId: "food")]
        let byId = Dictionary(uniqueKeysWithValues: accounts.map { ($0.id, $0) })
        XCTAssertTrue(BudgetMath.chain(
            from: "meals",
            byId: byId,
            contains: ["food"],
            includingSelf: false
        ))
        XCTAssertFalse(BudgetMath.chain(
            from: "meals",
            byId: byId,
            contains: ["meals"],
            includingSelf: false
        ))
        // An unknown id and a root (no ancestors) contain nothing.
        XCTAssertFalse(BudgetMath.chain(
            from: "ghost",
            byId: byId,
            contains: ["food"],
            includingSelf: false
        ))
        XCTAssertFalse(BudgetMath.chain(
            from: "food",
            byId: byId,
            contains: ["food"],
            includingSelf: false
        ))
    }

    func testLeafUnderCountedParentDefaultsCounted() {
        let accounts = [account("food", parentId: nil), account("meals", parentId: "food")]
        XCTAssertFalse(BudgetMath.isExcludedByCategory(
            leafAccountId: "meals",
            accounts: accounts,
            excludedAccountIds: ["travel"]
        ))
    }

    func testEmptyExclusionListAndUnknownLeafDefaultCounted() {
        let accounts = [account("food", parentId: nil)]
        XCTAssertFalse(BudgetMath.isExcludedByCategory(
            leafAccountId: "food",
            accounts: accounts,
            excludedAccountIds: []
        ))
        XCTAssertFalse(BudgetMath.isExcludedByCategory(
            leafAccountId: nil,
            accounts: accounts,
            excludedAccountIds: ["food"]
        ))
        XCTAssertFalse(BudgetMath.isExcludedByCategory(
            leafAccountId: "ghost",
            accounts: accounts,
            excludedAccountIds: ["food"]
        ))
    }
}
