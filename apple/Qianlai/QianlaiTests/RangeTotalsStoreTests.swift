//
//  RangeTotalsStoreTests.swift
//  QianlaiTests
//
//  Created by Lisiur Day on 2026/9/22.
//

import XCTest
@testable import Qianlai

/// The range card's pure snapshot-cache key shaping — ledger scoping and
/// the year-boundary window split. (Same-window stability needs no test:
/// the key is a pure function of already-Equal values, so a same-inputs
/// assertion could never fail.) The fetch path stays untestable
/// (APIClient.shared is not injectable); SnapshotCacheTests covers the
/// persistence itself.
final class RangeTotalsStoreTests: XCTestCase {
    /// Plain gregorian over a fixed zone, pinned so the fixture windows
    /// have no host leeway.
    private let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Shanghai")!
        return calendar
    }()

    private func date(_ year: Int, _ month: Int, _ day: Int) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day))!
    }

    /// The plain 2026 year window — the mid-year fetch's key shape.
    private var yearWindow: MonthWindow {
        MonthWindow(
            from: calendar.startOfDay(for: date(2026, 1, 1)),
            to: date(2026, 12, 31).addingTimeInterval(86_399)
        )
    }

    func testKeysAreLedgerScoped() {
        XCTAssertNotEqual(
            RangeTotalsStore.snapshotKey(ledgerId: "led-a", window: yearWindow),
            RangeTotalsStore.snapshotKey(ledgerId: "led-b", window: yearWindow),
            "one ledger's day list must never hydrate another's card"
        )
    }

    func testWidenedBoundaryWindowKeysApartFromThePlainYear() {
        // At the year boundary the fetch widens back to the week's start —
        // that widened day list must persist under its own key, never read
        // as (or overwrite) the plain year's record.
        let widened = MonthWindow(
            from: calendar.startOfDay(for: date(2025, 12, 28)),
            to: date(2026, 12, 31).addingTimeInterval(86_399)
        )
        XCTAssertNotEqual(
            RangeTotalsStore.snapshotKey(ledgerId: "led", window: yearWindow),
            RangeTotalsStore.snapshotKey(ledgerId: "led", window: widened)
        )
    }
}
