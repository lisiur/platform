//
//  DashboardChartCardTests.swift
//  QianlaiTests
//
//  Created by Lisiur Day on 2026/9/17.
//

import XCTest
@testable import Qianlai

/// The trend card's day-bucket parsing: the daily-summary's "yyyy-MM-dd" is
/// a LOCAL day key the server bucketed under the request's tz offset, so
/// the parse must land on that calendar day's midnight in the CURRENT
/// calendar — never a UTC-instant round-trip, which would shift buckets east
/// of UTC. Everything else on the chart cards is Swift Charts rendering.
final class DashboardChartCardTests: XCTestCase {
    private func components(of date: Date) -> DateComponents {
        Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
    }

    func testParsesBucketToLocalMidnight() throws {
        let date = try XCTUnwrap(MonthTrendChartCard.dayDate("2026-09-17"))
        let parts = components(of: date)
        XCTAssertEqual(parts.year, 2026)
        XCTAssertEqual(parts.month, 9)
        XCTAssertEqual(parts.day, 17)
        XCTAssertEqual(parts.hour, 0)
        XCTAssertEqual(parts.minute, 0)
        XCTAssertEqual(parts.second, 0)
    }

    func testParseRoundTripsAcrossEveryMonthBoundary() {
        for month in 1...12 {
            let key = String(format: "2026-%02d-01", month)
            let date = MonthTrendChartCard.dayDate(key)
            XCTAssertNotNil(date, key)
            let parts = components(of: date!)
            XCTAssertEqual(parts.year, 2026, key)
            XCTAssertEqual(parts.month, month, key)
            XCTAssertEqual(parts.day, 1, key)
        }
    }

    func testRejectsMalformedKeys() {
        XCTAssertNil(MonthTrendChartCard.dayDate(""))
        XCTAssertNil(MonthTrendChartCard.dayDate("2026-09"))
        XCTAssertNil(MonthTrendChartCard.dayDate("not-a-day"))
        // The header keys' format has no time component — a stray ISO
        // instant must not sneak through.
        XCTAssertNil(MonthTrendChartCard.dayDate("2026-09-17T10:00:00Z"))
    }
}
