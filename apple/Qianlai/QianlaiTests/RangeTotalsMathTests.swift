//
//  RangeTotalsMathTests.swift
//  QianlaiTests
//
//  Created by Lisiur Day on 2026/9/22.
//

import XCTest
@testable import Qianlai

final class RangeTotalsMathTests: XCTestCase {
    /// Plain gregorian over a fixed zone — Sunday-led weeks (the bare
    /// calendar's default), pinned so the week math has no host leeway.
    private let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Shanghai")!
        calendar.firstWeekday = 1
        return calendar
    }()

    private func date(_ year: Int, _ month: Int, _ day: Int) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day))!
    }

    /// The server bucket's "yyyy-MM-dd" LOCAL day-key shape.
    private func bucket(
        _ year: Int, _ month: Int, _ day: Int,
        income: Int = 0, expense: Int = 0
    ) -> DayIncomeExpense {
        DayIncomeExpense(
            day: String(format: "%04d-%02d-%02d", year, month, day),
            incomeCents: income,
            expenseCents: expense
        )
    }

    func testSumsTodayWeekAndYearForBothFlows() {
        // Tue 2026-09-22; the Sunday-led week spans Sep 20–26, so the 20th
        // counts toward the week while January and October stay year-side.
        let today = date(2026, 9, 22)
        let days = [
            bucket(2026, 1, 5, income: 100, expense: 10),
            bucket(2026, 9, 20, expense: 200),
            bucket(2026, 9, 21, income: 30, expense: 300),
            bucket(2026, 9, 22, income: 40, expense: 400),
            bucket(2026, 10, 1, expense: 50),
        ]
        let totals = RangeTotalsMath.totals(days: days, today: today, calendar: calendar)
        XCTAssertEqual(totals.today, RangeTotalsMath.PeriodTotals(incomeCents: 40, expenseCents: 400))
        XCTAssertEqual(totals.week, RangeTotalsMath.PeriodTotals(incomeCents: 70, expenseCents: 900))
        XCTAssertEqual(totals.year, RangeTotalsMath.PeriodTotals(incomeCents: 170, expenseCents: 960))
    }

    func testYearBoundaryWeekCountsTheOldYearTowardTheWeekOnly() {
        // Fri 2027-01-01; the Sunday-led week reaches back to Dec 27 2026 —
        // those days ride the week figure but never the year's.
        let today = date(2027, 1, 1)
        let days = [
            bucket(2026, 12, 28, income: 500, expense: 500),
            bucket(2027, 1, 1, income: 100, expense: 100),
        ]
        let totals = RangeTotalsMath.totals(days: days, today: today, calendar: calendar)
        XCTAssertEqual(totals.today, RangeTotalsMath.PeriodTotals(incomeCents: 100, expenseCents: 100))
        XCTAssertEqual(totals.week, RangeTotalsMath.PeriodTotals(incomeCents: 600, expenseCents: 600))
        XCTAssertEqual(totals.year, RangeTotalsMath.PeriodTotals(incomeCents: 100, expenseCents: 100))
    }

    func testRefundDayNetsThroughTheSums() {
        // A refund-heavy day nets negative — the sums carry the sign like
        // the stat card does.
        let today = date(2026, 9, 22)
        let days = [
            bucket(2026, 9, 21, expense: 300),
            bucket(2026, 9, 22, expense: -150),
        ]
        let totals = RangeTotalsMath.totals(days: days, today: today, calendar: calendar)
        XCTAssertEqual(totals.today.expenseCents, -150)
        XCTAssertEqual(totals.week.expenseCents, 150)
        XCTAssertEqual(totals.year.expenseCents, 150)
    }

    func testEmptyDayListRendersZeros() {
        let totals = RangeTotalsMath.totals(
            days: [], today: date(2026, 9, 22), calendar: calendar
        )
        XCTAssertEqual(
            totals,
            RangeTotalsMath.Totals(
                today: RangeTotalsMath.PeriodTotals(incomeCents: 0, expenseCents: 0),
                week: RangeTotalsMath.PeriodTotals(incomeCents: 0, expenseCents: 0),
                year: RangeTotalsMath.PeriodTotals(incomeCents: 0, expenseCents: 0)
            )
        )
    }

    func testFetchWindowWidensBackToTheWeekStartAcrossTheBoundary() {
        // Jan 1 2027's week reaches into 2026 — the fetch widens to the
        // week's Sunday start, and the year end stays Dec 31.
        let boundary = RangeTotalsMath.window(for: date(2027, 1, 1), calendar: calendar)
        XCTAssertEqual(boundary.from, calendar.startOfDay(for: date(2026, 12, 27)))
        XCTAssertEqual(
            calendar.dateComponents([.year, .month, .day], from: boundary.to),
            DateComponents(year: 2027, month: 12, day: 31)
        )

        // Mid-year weeks never widen: plain Jan 1 → Dec 31.
        let plain = RangeTotalsMath.window(for: date(2026, 9, 22), calendar: calendar)
        XCTAssertEqual(plain.from, calendar.startOfDay(for: date(2026, 1, 1)))
        XCTAssertEqual(
            calendar.dateComponents([.year, .month, .day], from: plain.to),
            DateComponents(year: 2026, month: 12, day: 31)
        )
    }

    func testWeekWindowSpansTheFullInterval() throws {
        let window = try XCTUnwrap(
            RangeTotalsMath.weekWindow(for: date(2026, 9, 22), calendar: calendar)
        )
        XCTAssertEqual(window.from, calendar.startOfDay(for: date(2026, 9, 20)))
        // The end is the interval's last instant — still Saturday the 26th.
        XCTAssertEqual(
            calendar.dateComponents([.year, .month, .day], from: window.to),
            DateComponents(year: 2026, month: 9, day: 26)
        )
    }
}
