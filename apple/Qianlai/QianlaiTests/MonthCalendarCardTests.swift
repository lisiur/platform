//
//  MonthCalendarCardTests.swift
//  QianlaiTests
//
//  Created by Lisiur Day on 2026/9/18.
//

import XCTest
@testable import Qianlai

/// The calendar card's pure math: the Monday-first grid cut (blank counts,
/// row count, in-month flags) and the lunar sub-labels. The lunar asserts
/// were cross-checked against the reference app's September 2026 layout —
/// 廿一 on the 2nd, 八月 on the 11th (a lunar month start), 十五 under the
/// 中秋节 festival on the 25th.
final class MonthCalendarCardTests: XCTestCase {
    private var gregorian: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone.current
        return calendar
    }

    private func date(_ year: Int, _ month: Int, _ day: Int) -> Date {
        gregorian.date(from: DateComponents(year: year, month: month, day: day))!
    }

    private func weekday(_ date: Date) -> Int {
        gregorian.component(.weekday, from: date)
    }

    // MARK: Grid cut

    func testSeptember2026CutsOneLeadingBlankIntoFiveRows() {
        // 2026-09-01 is a Tuesday: one Monday filler (Aug 31) ahead of 30
        // days → 31 cells → 5 rows (35 cells), trailing into October.
        let days = MonthGrid.days(monthStart: date(2026, 9, 1), calendar: gregorian)
        XCTAssertEqual(days.count, 35)
        XCTAssertEqual(days.filter(\.isInMonth).count, 30)
        XCTAssertFalse(days.first!.isInMonth)
        XCTAssertEqual(weekday(days.first!.date), 2) // every row leads with Monday
        XCTAssertTrue(days[1].isInMonth)
        XCTAssertEqual(gregorian.component(.day, from: days[1].date), 1)
        XCTAssertFalse(days.last!.isInMonth)
        XCTAssertEqual(gregorian.component(.day, from: days.last!.date), 4)
    }

    func testFebruary2027FitsFourExactRows() {
        // 2027-02-01 is a Monday and the month has 28 days: no filler at
        // all, exactly four rows — the shortest shape the grid renders.
        let days = MonthGrid.days(monthStart: date(2027, 2, 1), calendar: gregorian)
        XCTAssertEqual(days.count, 28)
        XCTAssertTrue(days.allSatisfy(\.isInMonth))
        XCTAssertEqual(weekday(days.first!.date), 2)
    }

    func testSundayStartingMonthTakesSixLeadingBlanks() {
        // 2026-02-01 is a Sunday: six Monday-first fillers (Jan 26–31)
        // ahead of 28 days → 34 cells → 5 rows.
        let days = MonthGrid.days(monthStart: date(2026, 2, 1), calendar: gregorian)
        XCTAssertEqual(days.count, 35)
        XCTAssertEqual(days.filter(\.isInMonth).count, 28)
        XCTAssertFalse(days[0].isInMonth)
        XCTAssertTrue(days[6].isInMonth)
        XCTAssertEqual(gregorian.component(.day, from: days[6].date), 1)
    }

    // MARK: Lunar sub-labels

    func testLunarDayGlyphsMatchReferenceSeptember2026() {
        XCTAssertEqual(LunarDayLabel.label(for: date(2026, 9, 2)), "廿一")
        XCTAssertEqual(LunarDayLabel.label(for: date(2026, 9, 11)), "八月") // lunar month start
        XCTAssertEqual(LunarDayLabel.label(for: date(2026, 9, 30)), "二十")
        XCTAssertEqual(LunarDayLabel.label(for: date(2026, 8, 31)), "十九") // a filler day still labels
    }

    func testFestivalKeysCoverSolarLunarAndEve() {
        XCTAssertEqual(LunarDayLabel.festivalKey(for: date(2026, 9, 10)), "dashboard.calendarCard.festival.teachers")
        XCTAssertEqual(LunarDayLabel.festivalKey(for: date(2026, 9, 25)), "dashboard.calendarCard.festival.midAutumn")
        XCTAssertEqual(LunarDayLabel.festivalKey(for: date(2026, 10, 1)), "dashboard.calendarCard.festival.national")
        XCTAssertEqual(LunarDayLabel.festivalKey(for: date(2026, 2, 17)), "dashboard.calendarCard.festival.springFestival")
        // 除夕 floats with the lunar year: 2026's is the day before 春节.
        XCTAssertEqual(LunarDayLabel.festivalKey(for: date(2026, 2, 16)), "dashboard.calendarCard.festival.newYearsEve")
    }

    func testEveryFestivalKeyCarriesACatalogDefault() {
        // A table entry whose key misses the defaults map would fall back
        // to the raw key string on a catalog miss.
        let keys = (solarFestivals: LunarDayLabel.solarFestivals.values.flatMap(\.values),
                    lunarFestivals: LunarDayLabel.lunarFestivals.values.flatMap(\.values))
        for key in keys.solarFestivals + keys.lunarFestivals {
            XCTAssertNotNil(LunarDayLabel.festivalDefaults[key], key)
        }
    }

    // MARK: Cell amounts

    func testCellAmountDropsDecimalsForWholeValues() {
        let english = Locale(identifier: "en_US")
        XCTAssertEqual(MonthCalendarCard.amount(0, locale: english), "0")
        XCTAssertEqual(MonthCalendarCard.amount(1_200, locale: english), "12")
        XCTAssertEqual(MonthCalendarCard.amount(12_300, locale: english), "123")
    }

    func testCellAmountCollapsesFiveFiguresToCompact() {
        let english = Locale(identifier: "en_US")
        XCTAssertEqual(MonthCalendarCard.amount(12_345_600, locale: english), "123.5K")
    }
}
