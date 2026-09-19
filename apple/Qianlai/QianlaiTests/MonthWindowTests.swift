//
//  MonthWindowTests.swift
//  QianlaiTests
//
//  Created by Lisiur Day on 2026/9/19.
//

import XCTest
@testable import Qianlai

/// `MonthWindow.singleMonth`: only a window that is exactly one natural
/// LOCAL month — first-day start through last-day end — resolves to its
/// `YearMonth`; anything wider, narrower, or shifted is nil. The stats
/// component's calendar-card gate and the drill page's month title both
/// hang off this one predicate.
final class MonthWindowTests: XCTestCase {
    private func makeWindow(year: Int, month: Int) throws -> MonthWindow {
        let start = try XCTUnwrap(Calendar.current.date(from: DateComponents(year: year, month: month, day: 1)))
        return AppDates.monthWindow(containing: start)
    }

    func testNaturalMonthResolvesToItsYearMonth() throws {
        XCTAssertEqual(try makeWindow(year: 2026, month: 9).singleMonth, YearMonth(year: 2026, month: 9))
        // Year boundaries stay the window's own month.
        XCTAssertEqual(try makeWindow(year: 2026, month: 1).singleMonth, YearMonth(year: 2026, month: 1))
        XCTAssertEqual(try makeWindow(year: 2026, month: 12).singleMonth, YearMonth(year: 2026, month: 12))
        // A leap February is still one natural month.
        XCTAssertEqual(try makeWindow(year: 2024, month: 2).singleMonth, YearMonth(year: 2024, month: 2))
    }

    func testSingleDayWindowIsNotAMonth() throws {
        let calendar = Calendar.current
        let day = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 9, day: 15)))
        let window = MonthWindow(
            from: calendar.startOfDay(for: day),
            to: AppDates.localEndOfDay(day)
        )
        XCTAssertNil(window.singleMonth)
    }

    func testTwoMonthWindowIsNotAMonth() throws {
        let august = try makeWindow(year: 2026, month: 8)
        let september = try makeWindow(year: 2026, month: 9)
        let window = MonthWindow(from: august.from, to: september.to)
        XCTAssertNil(window.singleMonth)
    }

    func testShiftedMonthLengthWindowIsNotAMonth() throws {
        // The same 31-day length as August but starting mid-month
        // (Aug 15 – Sep 14) is not one natural month.
        let calendar = Calendar.current
        let from = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 8, day: 15)))
        let lastDay = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 9, day: 14)))
        let window = MonthWindow(
            from: calendar.startOfDay(for: from),
            to: AppDates.localEndOfDay(lastDay)
        )
        XCTAssertNil(window.singleMonth)
    }
}
