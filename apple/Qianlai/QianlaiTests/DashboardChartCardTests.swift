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

/// The composition card's 一级 rollup: leaves merge into their parent's
/// bucket, top-level leaves keep their own, offsetting corrections net
/// into the parent (and non-positive buckets drop), ordering is
/// amount-descending and stable on ties.
final class CompositionCardLevelTests: XCTestCase {
    private func row(
        _ accountId: String,
        name: String? = nil,
        code: String? = nil,
        parentName: String? = nil,
        parentCode: String? = nil,
        parentAccountId: String? = nil,
        parentIcon: String? = nil,
        icon: String? = nil,
        cents: Int
    ) -> CategoryAmountRow {
        CategoryAmountRow(
            accountId: accountId,
            name: name,
            code: code,
            parentName: parentName,
            parentCode: parentCode,
            parentAccountId: parentAccountId,
            parentIcon: parentIcon,
            icon: icon,
            amountCents: cents
        )
    }

    func testMergesLeavesUnderParentAndResolvesParentName() {
        let rows = [
            row("lunch", name: "午餐", parentCode: "food", cents: 210),
            row("dinner", name: "晚餐", parentCode: "food", cents: 100),
        ]
        let merged = CategoryBreakdownCard.levelOneRows(rows)
        XCTAssertEqual(merged.count, 1)
        XCTAssertEqual(merged[0].amountCents, 310)
        // The bucket renders as the parent — the same code → catalog
        // resolution the leaf rows' parent captions use.
        XCTAssertEqual(merged[0].displayName, CategoryAmountRow(accountId: "food", name: nil, code: "food", parentName: nil, parentCode: nil, amountCents: 0).displayName)
        XCTAssertEqual(merged[0].parentDisplayName, nil)
    }

    func testRollupBadgePrefersParentIconOverFirstChild() {
        // 一级分类用自己的图标: both children carry the parent's own icon
        // on every row; the bucket must show it, not the first child's.
        let rows = [
            row("meals", name: "三餐", parentCode: "food", parentIcon: "🍜", icon: "🍚", cents: 210),
            row("snacks", name: "零食", parentCode: "food", parentIcon: "🍜", icon: "🍿", cents: 100),
        ]
        let merged = CategoryBreakdownCard.levelOneRows(rows)
        XCTAssertEqual(merged.count, 1)
        XCTAssertEqual(merged[0].icon, "🍜")
    }

    func testRollupBadgeFallsBackToFirstChildIconWhenParentHasNone() {
        // Legacy payloads predate parentIcon: the first child's icon keeps
        // the badge non-generic.
        let rows = [
            row("meals", name: "三餐", parentCode: "food", icon: "🍚", cents: 210),
            row("snacks", name: "零食", parentCode: "food", icon: "🍿", cents: 100),
        ]
        let merged = CategoryBreakdownCard.levelOneRows(rows)
        XCTAssertEqual(merged[0].icon, "🍚")
    }

    func testTopLevelLeafKeepsItsOwnIcon() {
        // A parent-less top-level leaf IS the 一级分类 — its own icon.
        let rows = [
            row("apparel", code: "apparel", icon: "👕", cents: 99),
        ]
        let merged = CategoryBreakdownCard.levelOneRows(rows)
        XCTAssertEqual(merged[0].icon, "👕")
    }

    func testParentRowMergesIntoItsChildrensBucket() {
        // A parent's own direct line (not postable through the app's
        // pickers, so hypothetical) nets with its children — the bucket
        // key is the parent's real account id (the drill authority), so
        // the parent's own row carries it as accountId.
        let rows = [
            // The payload carries the full parent pair (id + code), the
            // way the server's join returns it — the head's display name
            // resolves through the parent code.
            row("lunch", name: "午餐", parentCode: "food", parentAccountId: "acc-food", cents: 210),
            row("acc-food", code: "food", cents: 50),
        ]
        let merged = CategoryBreakdownCard.levelOneRows(rows)
        XCTAssertEqual(merged.count, 1)
        XCTAssertEqual(merged[0].amountCents, 260)
        XCTAssertEqual(merged[0].displayName, CategoryAmountRow(accountId: "acc-food", name: nil, code: "food", parentName: nil, parentCode: nil, amountCents: 0).displayName)
    }

    func testTopLevelLeafKeepsItsOwnBucket() {
        // Self-buckets key on the row's own accountId (the drill
        // authority — c98ad060 trimmed the code/name fallbacks), so
        // same-named top-level leaves stay distinct slices.
        let rows = [
            row("apparel-1", code: "apparel", cents: 99),
            row("custom", name: "宠物", cents: 40),
        ]
        let merged = CategoryBreakdownCard.levelOneRows(rows)
        XCTAssertEqual(merged.map(\.accountId), ["apparel-1", "custom"])
        XCTAssertEqual(merged[0].amountCents, 99)
        XCTAssertEqual(merged[1].displayName, "宠物")
    }

    func testCorrectionsNetIntoParentAndEmptyBucketsDrop() {
        let rows = [
            row("acc-digital", name: "数码", cents: 300),
            row("refund", name: "退款", parentAccountId: "acc-digital", cents: -100),
            row("void", name: "撤账", parentName: "清空", cents: -50),
            row("zero", name: "零头", parentName: "归零", cents: 0),
        ]
        let merged = CategoryBreakdownCard.levelOneRows(rows)
        // 数码 nets to 200 and stays (the bucket carries the parent's
        // real id); 清空/归零 go non-positive and drop.
        XCTAssertEqual(merged.map(\.accountId), ["acc-digital"])
        XCTAssertEqual(merged[0].amountCents, 200)
    }

    func testOrdersByAmountDescendingStableOnTies() {
        let rows = [
            row("a-food", name: "a", parentAccountId: "acc-food", cents: 100),
            row("first-leaf", code: "apparel", cents: 50),
            row("b-food", name: "b", parentAccountId: "acc-food", cents: 200),
            row("second-leaf", code: "housing", cents: 50),
        ]
        let merged = CategoryBreakdownCard.levelOneRows(rows)
        // Both food leaves share the one parent bucket (300).
        XCTAssertEqual(merged.map(\.amountCents), [300, 50, 50])
        // Equal amounts keep first-seen order (Swift's sort is not stable;
        // the tiebreak indexes first appearance).
        XCTAssertEqual(merged.suffix(2).map(\.accountId), ["first-leaf", "second-leaf"])
    }
}
