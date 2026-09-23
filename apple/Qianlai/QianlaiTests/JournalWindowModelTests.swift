//
//  JournalWindowModelTests.swift
//  QianlaiTests
//
//  Created by Lisiur Day on 2026/9/23.
//

import XCTest
@testable import Qianlai

/// The extracted journal filter surface's pure date math — the tab
/// derivation and the week/year window writers (JournalFilters.swift).
/// Store-bound behavior (writes, pins) stays view-driven and is not
/// unit-tested here; these pin the rules both host pages depend on.
final class JournalWindowModelTests: XCTestCase {
    private var calendar: Calendar { Calendar.current }

    func testNilBoundsAreAll() {
        XCTAssertEqual(
            JournalWindowModel.timeTab(from: nil, to: nil, isRangePinned: false),
            .all
        )
    }

    func testExactWeekDerivesWeekTab() {
        // Any day lands its locale-week writer back on the week tab.
        let date = Self.date(2026, 9, 23)
        let window = JournalWindowModel.weekWindow(containing: date)
        XCTAssertEqual(
            JournalWindowModel.timeTab(from: window.from, to: window.to, isRangePinned: false),
            .week
        )
        // The writer's shape: interval start through the interval's last
        // midnight (end minus one day), not end-of-day.
        let interval = calendar.dateInterval(of: .weekOfYear, for: date)!
        XCTAssertEqual(window.from, interval.start)
        XCTAssertEqual(window.to, calendar.date(byAdding: .day, value: -1, to: interval.end)!)
    }

    func testExactMonthAndYearDeriveTheirTabs() {
        let monthStart = Self.date(2026, 9, 1)
        let monthEnd = Self.date(2026, 9, 30)
        XCTAssertEqual(
            JournalWindowModel.timeTab(from: monthStart, to: monthEnd, isRangePinned: false),
            .month
        )
        let yearWindow = JournalWindowModel.yearWindow(containing: monthStart)
        XCTAssertEqual(yearWindow.from, Self.date(2026, 1, 1))
        XCTAssertEqual(yearWindow.to, Self.date(2026, 12, 31))
        XCTAssertEqual(
            JournalWindowModel.timeTab(from: yearWindow.from, to: yearWindow.to, isRangePinned: false),
            .year
        )
    }

    func testCustomWindowDerivesRangeTab() {
        XCTAssertEqual(
            JournalWindowModel.timeTab(
                from: Self.date(2026, 9, 5), to: Self.date(2026, 9, 20), isRangePinned: false
            ),
            .range
        )
        // One-sided windows are the range editor too.
        XCTAssertEqual(
            JournalWindowModel.timeTab(from: Self.date(2026, 9, 5), to: nil, isRangePinned: false),
            .range
        )
    }

    func testPinnedRangeWinsOverPresetShapes() {
        // An exact month shaped by hand while the range tab is pinned
        // stays Range — the pin guards the editor's own window.
        XCTAssertEqual(
            JournalWindowModel.timeTab(
                from: Self.date(2026, 9, 1), to: Self.date(2026, 9, 30), isRangePinned: true
            ),
            .range
        )
        // All (nil bounds) still wins over the pin — an emptied window
        // ends the pin on the next clear pass.
        XCTAssertEqual(
            JournalWindowModel.timeTab(from: nil, to: nil, isRangePinned: true),
            .all
        )
    }

    func testSingleDayIsNotTheWeekTab() {
        // A one-day window is the .date preset — never a week, so the tab
        // falls to Range.
        let day = Self.date(2026, 9, 23)
        XCTAssertEqual(
            JournalWindowModel.timeTab(from: day, to: day, isRangePinned: false),
            .range
        )
    }

    private static func date(_ year: Int, _ month: Int, _ day: Int) -> Date {
        Calendar.current.date(from: DateComponents(year: year, month: month, day: day))!
    }
}
