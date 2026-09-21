//
//  DashboardChartCardTests.swift
//  QianlaiTests
//
//  Created by Lisiur Day on 2026/9/17.
//

import XCTest
@testable import Qianlai

/// The trend card's day keying: a window day looks its amounts up by the
/// daily-summary's exact "yyyy-MM-dd" string, built from LOCAL calendar
/// components — never a UTC-instant round-trip, which would shift buckets
/// east of UTC. Keying by string (not a parsed date or a day-of-month
/// number) is also what keeps a keep-previous payload from another window
/// from mis-mapping onto same-numbered days. Everything else on the chart
/// cards is Swift Charts rendering.
final class DashboardChartCardTests: XCTestCase {
    func testKeysRoundTripEveryBoundary() throws {
        let calendar = Calendar.current
        for month in 1...12 {
            let date = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: month, day: 1)))
            XCTAssertEqual(TrendChartCard.dayKey(date), String(format: "2026-%02d-01", month))
        }
        let yearEnd = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 12, day: 31)))
        XCTAssertEqual(TrendChartCard.dayKey(yearEnd), "2026-12-31")
    }

    func testKeyMatchesTheServerBucketShape() throws {
        // The key format is fixed-width — single-digit months/days pad
        // with zeros so the dictionary lookup hits the payload's keys.
        let date = try XCTUnwrap(Calendar.current.date(from: DateComponents(year: 2026, month: 3, day: 7)))
        XCTAssertEqual(TrendChartCard.dayKey(date), "2026-03-07")
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

/// The donut's slice hit-testing: a tap point in the ring's square frame
/// maps to the slice whose clockwise-from-12-o'clock span contains it —
/// the same cumulative walk the callout canvas draws — while points in
/// the hole (the total's zone) or past the rim find nothing.
final class CompositionCardSliceHitTests: XCTestCase {
    private func rows(_ amounts: [Int]) -> [CategoryAmountRow] {
        amounts.enumerated().map { index, cents in
            CategoryAmountRow(
                accountId: "acct-\(index)",
                name: nil,
                code: nil,
                parentName: nil,
                parentCode: nil,
                parentAccountId: nil,
                parentIcon: nil,
                icon: nil,
                amountCents: cents
            )
        }
    }

    /// A point at `fraction` of the full clockwise turn from 12 o'clock,
    /// `radius` points from the pie's center — the square frame's center,
    /// donutSide 132 / 2 = 66, mirroring the card's fixed geometry.
    private func point(turn fraction: Double, radius: CGFloat = 60) -> CGPoint {
        let center = CGPoint(x: 66, y: 66)
        let angle = fraction * 2 * .pi
        return CGPoint(
            x: center.x + CGFloat(sin(angle)) * radius,
            y: center.y - CGFloat(cos(angle)) * radius
        )
    }

    func testMapsTapToSliceByClockwiseAngle() {
        // 210:100:10 of 320 → spans of 0.65625 / 0.3125 / 0.03125 of the
        // turn; taps land inside the span they belong to.
        let amounts = rows([210, 100, 10])
        XCTAssertEqual(CategoryBreakdownCard.sliceIndex(at: point(turn: 0.1), rows: amounts), 0)
        XCTAssertEqual(CategoryBreakdownCard.sliceIndex(at: point(turn: 0.6), rows: amounts), 0)
        XCTAssertEqual(CategoryBreakdownCard.sliceIndex(at: point(turn: 0.8), rows: amounts), 1)
        XCTAssertEqual(CategoryBreakdownCard.sliceIndex(at: point(turn: 0.9), rows: amounts), 1)
        XCTAssertEqual(CategoryBreakdownCard.sliceIndex(at: point(turn: 0.975), rows: amounts), 2)
        XCTAssertEqual(CategoryBreakdownCard.sliceIndex(at: point(turn: 0.99), rows: amounts), 2)
        // The full turn round-trips to 12 o'clock — the first slice.
        XCTAssertEqual(CategoryBreakdownCard.sliceIndex(at: point(turn: 1.0), rows: amounts), 0)
    }

    func testHoleAndRimExteriorFindNoSlice() {
        // The hole holds the total label; the frame corners hold nothing.
        // Radii straddle the ring: inner ≈ 40.8, outer = 66.
        let amounts = rows([300])
        XCTAssertNil(CategoryBreakdownCard.sliceIndex(at: point(turn: 0.25, radius: 20), rows: amounts))
        XCTAssertNil(CategoryBreakdownCard.sliceIndex(at: point(turn: 0.25, radius: 75), rows: amounts))
    }

    func testSingleSliceCoversTheWholeTurn() {
        // One slice spans everything; the last-index fallback absorbs the
        // float overshoot at the 2π seam.
        let amounts = rows([999])
        XCTAssertEqual(CategoryBreakdownCard.sliceIndex(at: point(turn: 0.5), rows: amounts), 0)
        XCTAssertEqual(CategoryBreakdownCard.sliceIndex(at: point(turn: 0.999), rows: amounts), 0)
    }

    func testZeroOrNegativeTotalsFindNoSlice() {
        // A pie can't draw a non-positive slice — with nothing drawn
        // there is nothing to hit.
        XCTAssertNil(CategoryBreakdownCard.sliceIndex(at: point(turn: 0.1), rows: rows([0])))
        XCTAssertNil(CategoryBreakdownCard.sliceIndex(at: point(turn: 0.1), rows: rows([-5])))
    }
}

/// The trend card's sticky-readout default: the bubble opens on today
/// when the displayed window contains it — regardless of whether
/// today has data (¥0 is the truthful read; the full-window series makes
/// every day a target) — else on the window's last day. Pure rule,
/// pinned here.
final class TrendCardDefaultSelectionTests: XCTestCase {
    func testCurrentWindowPicksToday() {
        XCTAssertEqual(
            TrendChartCard.defaultSelectionDayIndex(todayIndex: 19, dayCount: 30),
            19
        )
    }

    func testTodayAppliesEvenWithoutData() {
        // Day 1 with no entries yet still reads — as ¥0.
        XCTAssertEqual(
            TrendChartCard.defaultSelectionDayIndex(todayIndex: 1, dayCount: 30),
            1
        )
    }

    func testOtherWindowsDefaultToTheLastDay() {
        XCTAssertEqual(
            TrendChartCard.defaultSelectionDayIndex(todayIndex: nil, dayCount: 30),
            30
        )
        XCTAssertEqual(
            TrendChartCard.defaultSelectionDayIndex(todayIndex: nil, dayCount: 28),
            28
        )
    }

    func testEmptyWindowFindsNothing() {
        XCTAssertNil(TrendChartCard.defaultSelectionDayIndex(todayIndex: 19, dayCount: 0))
    }
}

/// The trend card's tap-to-select mapping: a tap offset within the plot
/// maps onto the window's day bands (width fraction × day count, the
/// same linear scale `.chartXScale` pins, clamped at the far edge) while
/// offsets outside the plot and degenerate geometry find nothing.
final class TrendCardTapSelectionTests: XCTestCase {
    func testMapsOffsetsOntoDayBands() {
        // A 30-day window over a 300pt plot: 10pt bands.
        XCTAssertEqual(TrendChartCard.tappedDayIndex(atX: 0, plotWidth: 300, dayCount: 30), 0)
        XCTAssertEqual(TrendChartCard.tappedDayIndex(atX: 9.9, plotWidth: 300, dayCount: 30), 0)
        XCTAssertEqual(TrendChartCard.tappedDayIndex(atX: 10, plotWidth: 300, dayCount: 30), 1)
        XCTAssertEqual(TrendChartCard.tappedDayIndex(atX: 155, plotWidth: 300, dayCount: 30), 15)
        XCTAssertEqual(TrendChartCard.tappedDayIndex(atX: 299.9, plotWidth: 300, dayCount: 30), 29)
        // The far edge lands on the last band, never past it.
        XCTAssertEqual(TrendChartCard.tappedDayIndex(atX: 300, plotWidth: 300, dayCount: 30), 29)
    }

    func testOutsideThePlotFindsNothing() {
        XCTAssertNil(TrendChartCard.tappedDayIndex(atX: -0.5, plotWidth: 300, dayCount: 30))
        XCTAssertNil(TrendChartCard.tappedDayIndex(atX: 300.5, plotWidth: 300, dayCount: 30))
    }

    func testSingleDayWindowMapsAnywhereToItsOneDay() {
        XCTAssertEqual(TrendChartCard.tappedDayIndex(atX: 0, plotWidth: 120, dayCount: 1), 0)
        XCTAssertEqual(TrendChartCard.tappedDayIndex(atX: 120, plotWidth: 120, dayCount: 1), 0)
    }

    func testDegenerateGeometryFindsNothing() {
        XCTAssertNil(TrendChartCard.tappedDayIndex(atX: 0, plotWidth: 0, dayCount: 30))
        XCTAssertNil(TrendChartCard.tappedDayIndex(atX: 0, plotWidth: 300, dayCount: 0))
    }
}
