//
//  CategoryBreakdownCard.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/17.
//

import Charts
import SwiftUI

/// The dashboard's composition card: the selected month's per-category
/// totals as a donut with leader-line callouts naming the major slices
/// (under-10% shares and near-adjacent neighbors rely on the legend) and
/// a full legend beneath, switchable between the expense and income
/// sides and between slice granularities — the parent rollup (一级分类,
/// the default) or every leaf as posted (全部). The data is the
/// category-summary report at the `members` share mode — the trend
/// card's member-share split keyed per account, so it reconciles with
/// the trend card beside it and with the stat card above. A pie can't
/// draw a non-positive slice: zero/negative nets (offsetting
/// corrections) stay out of both the donut and the legend, and the
/// center total is the sum of what's actually shown.
struct CategoryBreakdownCard: View {
    @Environment(BackgroundSettings.self) private var backgroundSettings

    let summary: CategorySummaryResponse
    var currency: String?
    /// Threaded locale — the percentage labels must follow the in-app
    /// language override, not the device language.
    let locale: Locale
    /// One legend row's tap drills into its kind's entries: a leaf row
    /// scopes to the leaf account, a parent rollup row scopes to the
    /// parent account. nil disables drilling (the page that mounted the
    /// card owns the rest of the flow).
    var onSelectCategory: ((JournalDrillDown) -> Void)? = nil

    @State private var side: Side = .expense
    /// Slice granularity: the parent rollup (一级分类 — the default) or
    /// every leaf as posted (全部).
    @State private var level: Level

    enum Level: String, CaseIterable, Identifiable {
        case parent
        case leaf

        var id: String { rawValue }

        var label: String {
            switch self {
            case .parent: L10n.string("dashboard.compositionCard.levelParent", defaultValue: "Top-level")
            case .leaf: L10n.string("dashboard.compositionCard.levelLeaf", defaultValue: "All")
            }
        }
    }

    init(summary: CategorySummaryResponse, currency: String?, locale: Locale, initialLevel: Level = .parent, onSelectCategory: ((JournalDrillDown) -> Void)? = nil) {
        self.summary = summary
        self.currency = currency
        self.locale = locale
        self.onSelectCategory = onSelectCategory
        _level = State(initialValue: initialLevel)
    }

    enum Side: String, CaseIterable, Identifiable {
        case expense
        case income

        var id: String { rawValue }

        var label: String {
            switch self {
            case .expense: L10n.string("quick.kind.expense", defaultValue: "Expense")
            case .income: L10n.string("quick.kind.income", defaultValue: "Income")
            }
        }

        /// The QuickEntryKind this side drills into — case names line up
        /// by design so the legend row's drill target carries the right
        /// kind without a string-keyed map.
        var kind: QuickEntryKind {
            switch self {
            case .expense: .expense
            case .income: .income
            }
        }
    }

    /// Categorical palette, deliberately clear of the income-red /
    /// expense-green semantic pair so no slice can read as a side color.
    /// System colors keep dark mode safe; the modulo wrap colors every
    /// category no matter how many a month touches.
    private static let palette: [Color] = [
        .blue, .orange, .purple, .teal, .pink,
        .indigo, .mint, .cyan, .yellow, .brown,
    ]

    private var rows: [CategoryAmountRow] {
        let base = side == .expense ? summary.expense : summary.income
        return level == .leaf ? base.filter { $0.amountCents > 0 } : Self.levelOneRows(base)
    }

    private var totalCents: Int {
        rows.reduce(0) { $0 + $1.amountCents }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            if rows.isEmpty {
                ChartCardEmpty(systemName: "chart.pie")
            } else {
                donut
                legend
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(backgroundSettings.cardSurface)
        )
        .glassRim(cornerRadius: 20)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                ChartCardBadge(systemName: "chart.pie.fill")
                Text(L10n.string("dashboard.compositionCard.title", defaultValue: "Breakdown"))
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Spacer(minLength: 8)
                segmentedPicker(
                    L10n.string("dashboard.compositionCard.sideA11y", defaultValue: "Income or expense"),
                    selection: $side,
                    options: Side.allCases,
                    label: \.label
                )
            }
            segmentedPicker(
                L10n.string("dashboard.compositionCard.levelA11y", defaultValue: "Category level"),
                selection: $level,
                options: Level.allCases,
                label: \.label
            )
        }
    }

    private var donut: some View {
        ZStack {
            ring
            // The leader lines + type labels ride as a canvas over the
            // chart, recomputing slice angles from the same rows so the
            // two can never disagree about which slice is which.
            Canvas { context, size in
                Self.drawCallouts(into: &context, size: size, rows: rows)
            }
            .allowsHitTesting(false)
        }
        .frame(height: Self.calloutRegionHeight)
        .frame(maxWidth: .infinity)
    }

    private var ring: some View {
        Chart {
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                SectorMark(
                    angle: .value("amount", Double(row.amountCents)),
                    innerRadius: .fixed(Self.innerRadius),
                    outerRadius: .fixed(Self.outerRadius),
                    angularInset: 1
                )
                .cornerRadius(3)
                .foregroundStyle(Self.color(index))
            }
        }
        .chartLegend(.hidden)
        .frame(width: Self.donutSide, height: Self.donutSide)
        .overlay {
            VStack(spacing: 2) {
                Text(L10n.string("dashboard.compositionCard.total", defaultValue: "Total"))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(Money.format(Double(totalCents) / 100, currency: currency))
                    .font(.callout.weight(.bold).monospacedDigit())
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    // The budget is the ring hole, not the frame: tighter
                    // padding keeps the figure inside the donut's eye.
                    .padding(.horizontal, 26)
            }
        }
    }

    private var legend: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                legendRow(index, row)
            }
        }
    }

    @ViewBuilder
    private func legendRow(_ index: Int, _ row: CategoryAmountRow) -> some View {
        let (drillAccountId, drillParentAccountId) = drillTarget(for: row, level: level)
        let figures = HStack(spacing: 8) {
            // Color cue — the donut slice palette by row index. Stays
            // alongside the icon badge: palette = which slice this row is,
            // icon = which category. Without the dot the eye can't map
            // legend → donut slice at a glance.
            Circle()
                .fill(Self.color(index))
                .frame(width: 8, height: 8)
            legendIconBadge(for: row)
            Text(row.displayName)
                .font(.subheadline)
                .lineLimit(1)
            if let parent = row.parentDisplayName {
                Text("(\(parent))")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            Text(Money.format(Double(row.amountCents) / 100, currency: currency))
                .font(.footnote.weight(.medium).monospacedDigit())
            Text(percent(row.amountCents))
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
                .frame(minWidth: 53, alignment: .trailing)
        }
        .padding(.vertical, 5)
        Group {
            if let onSelectCategory,
               drillAccountId != nil || drillParentAccountId != nil {
                figures
                    .contentShape(Rectangle())
                    .onTapGesture {
                        onSelectCategory(
                            JournalDrillDown(
                                kind: side.kind,
                                accountId: drillAccountId,
                                parentAccountId: drillParentAccountId,
                                // Carried in the title's "时间 · <label>" slot.
                                // Bucket = parent for 一级 rolls, leaf for 全部.
                                categoryLabel: row.displayName
                            )
                        )
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.isButton)
            } else {
                figures
            }
        }
    }

    /// What a legend row drills into: a leaf row scopes to its account, a
    /// rollup row scopes to its parent (so the server's rollup filter
    /// runs). Leaves with their own non-null `parentAccountId` still drill
    /// by the leaf — the parent would over-fetch — so leaf + parent is
    /// the leaf-only drill.
    private func drillTarget(for row: CategoryAmountRow, level: Level)
        -> (accountId: String?, parentAccountId: String?) {
        if level == .leaf {
            return (row.accountId, nil)
        }
        return (nil, row.parentAccountId ?? (row.accountId.isEmpty ? nil : row.accountId))
    }

    /// The legend row's leading icon badge: emoji when the category has
    /// one, the side's SF Symbol otherwise. The color cue lives in the
    /// row's separate dot; this is purely the category glyph.
    private func legendIconBadge(for row: CategoryAmountRow) -> some View {
        Group {
            if let icon = row.icon, !icon.isEmpty {
                Text(icon)
                    .font(.footnote)
            } else {
                Image(systemName: side == .income ? "arrow.up.circle.fill" : "arrow.down.circle.fill")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: 20, height: 20)
    }

    private func percent(_ cents: Int) -> String {
        guard totalCents > 0 else { return "—" }
        let fraction = Double(cents) / Double(totalCents)
        return fraction.formatted(
            .percent
                .precision(.fractionLength(0))
                .locale(locale)
        )
    }

    private static func color(_ index: Int) -> Color {
        palette[index % palette.count]
    }

    // MARK: - Level rollup (一级)

    /// Rolls leaf rows up one level: children merge into their parent's
    /// bucket, keyed on the parent's real account id when known so a drill-
    /// down through the legend row stays precise (the donut can't
    /// distinguish same-named parents anyway, but the drill can). Falls back
    /// to `parentCode ?? parentName ?? code ?? name ?? accountId` for
    /// legacy summaries whose parent join omits the id, so the donut's
    /// bucketing never changes for older payloads. Amounts sum from the
    /// RAW rows first, then non-positive buckets drop, matching the leaf
    /// view's can't-draw-a-negative rule. Amount-descending, stable on
    /// ties (first-seen order). Pure so the rollup stays unit-testable.
    nonisolated static func levelOneRows(_ base: [CategoryAmountRow]) -> [CategoryAmountRow] {
        var order: [String] = []
        var buckets: [String: (sum: Int, head: CategoryAmountRow)] = [:]
        for row in base {
            let key = row.parentAccountId
                ?? row.parentCode
                ?? row.parentName
                ?? row.code
                ?? row.name
                ?? row.accountId
            let isChild = row.parentAccountId != nil
                || row.parentCode != nil
                || row.parentName != nil
            let head = CategoryAmountRow(
                accountId: row.parentAccountId ?? key,
                name: isChild ? row.parentName : row.name,
                code: isChild ? row.parentCode : row.code,
                parentName: nil,
                parentCode: nil,
                parentAccountId: nil,
                amountCents: row.amountCents
            )
            if var bucket = buckets[key] {
                bucket.sum += row.amountCents
                buckets[key] = bucket
            } else {
                order.append(key)
                buckets[key] = (row.amountCents, head)
            }
        }
        return order.indices.compactMap { index -> (index: Int, row: CategoryAmountRow)? in
            let key = order[index]
            guard let bucket = buckets[key], bucket.sum > 0 else { return nil }
            var row = bucket.head
            row.amountCents = bucket.sum
            return (index, row)
        }
        .sorted {
            $0.row.amountCents != $1.row.amountCents
                ? $0.row.amountCents > $1.row.amountCents
                : $0.index < $1.index
        }
        .map(\.row)
    }

    // MARK: - Leader-line callouts

    /// Callout geometry, in points: the ring draws with these same fixed
    /// radii (`SectorMark` centers the pie in its square frame), the
    /// leader lines run radially from just outside the rim to a bend,
    /// then out to the label. The region is the ring plus the margin the
    /// stacked labels live in.
    private static let donutSide: CGFloat = 132
    private static let outerRadius: CGFloat = donutSide / 2
    private static let innerRadius: CGFloat = outerRadius * 0.618
    private static let calloutRegionHeight: CGFloat = 196
    private static let edgeGap: CGFloat = 4
    private static let elbowRadius: CGFloat = outerRadius + 14
    private static let horizontalRun: CGFloat = 16
    private static let labelPad: CGFloat = 4
    private static let labelPitch: CGFloat = 20
    /// Slices under this share of the shown total skip the leader line
    /// and label (exactly 5% still draws) — the legend beneath names
    /// them.
    private static let calloutShareThreshold = 0.05
    /// Two same-side callouts whose bend points are closer than this
    /// vertical run would draw near-parallel lines into a shared label
    /// cluster — of the pair only the larger slice keeps its callout.
    private static let minSourceGap: CGFloat = 12

    /// Leader lines + type labels around the ring: from each slice's
    /// mid-angle a radial stub, a bend, then out to the category name.
    /// Slices under `calloutShareThreshold` are skipped, and same-side
    /// callouts whose sources sit too close together decluster to the
    /// larger slice. Labels stack per side at a fixed pitch so adjacent
    /// labels don't collide — the bend-to-label segment absorbs the
    /// vertical shift. Angles recompute from the rows the ring draws:
    /// sectors run clockwise from 12 o'clock in data order, matching
    /// `SectorMark`.
    private static func drawCallouts(
        into context: inout GraphicsContext,
        size: CGSize,
        rows: [CategoryAmountRow]
    ) {
        let total = rows.reduce(0) { $0 + $1.amountCents }
        guard total > 0, !rows.isEmpty else { return }
        let center = CGPoint(x: size.width / 2, y: size.height / 2)
        // Room one label may claim: from the label edge inward, the side
        // band beyond the elbow's horizontal run.
        let maxLabelWidth = size.width / 2 - (elbowRadius + horizontalRun + 2 * labelPad)

        // Which half of the ring the label hangs off. Distinct from the
        // expense/income `Side` — a slice of either can sit either side.
        enum RadialSide {
            case left
            case right
        }

        struct Callout {
            var midAngle: Double
            var radialSide: RadialSide
            var name: Text
            var color: Color
            var amount: Int
            /// The bend point's y — the label's natural anchor before
            /// per-side stacking shifts it.
            var bendY: CGFloat
            /// Slices under `calloutShareThreshold` skip the callout
            /// entirely (the legend names them).
            var hasLine: Bool
        }
        var callouts: [Callout] = []
        var cumulative = 0.0
        for (index, row) in rows.enumerated() {
            let span = Double(row.amountCents) / Double(total) * 2 * .pi
            let mid = cumulative + span / 2
            cumulative += span
            callouts.append(
                Callout(
                    midAngle: mid,
                    radialSide: sin(mid) >= 0 ? .right : .left,
                    name: fittedLabel(row.displayName, maxWidth: maxLabelWidth, in: context),
                    color: color(index),
                    amount: row.amountCents,
                    bendY: center.y - CGFloat(cos(mid)) * elbowRadius,
                    hasLine: Double(row.amountCents) / Double(total) >= calloutShareThreshold
                )
            )
        }

        // Per-side layout. Decluster first: walking top→bottom, a callout
        // whose bend point sits within `minSourceGap` of the previous kept
        // one would draw a near-parallel line into its neighbor's label —
        // of that pair only the larger slice keeps its callout (the legend
        // still names the smaller). Then the survivors' labels stack at a
        // fixed pitch (forward from the top, pulled back off the bottom)
        // so they never collide — the bend-to-label segment absorbs the
        // vertical shift.
        for radialSide in [RadialSide.right, .left] {
            let ranked = callouts.indices
                .filter { callouts[$0].radialSide == radialSide && callouts[$0].hasLine }
                .sorted { callouts[$0].bendY < callouts[$1].bendY }
            guard !ranked.isEmpty else { continue }
            var indices: [Int] = [ranked[0]]
            for index in ranked.dropFirst() {
                if callouts[index].bendY - callouts[indices.last!].bendY >= minSourceGap {
                    indices.append(index)
                } else if callouts[index].amount > callouts[indices.last!].amount {
                    indices[indices.count - 1] = index
                }
            }
            var ys: [CGFloat] = indices.map { callouts[$0].bendY }
            for i in 1..<ys.count where ys[i] < ys[i - 1] + labelPitch {
                ys[i] = ys[i - 1] + labelPitch
            }
            let bottom = size.height - labelPad
            if ys[ys.count - 1] > bottom {
                ys[ys.count - 1] = bottom
                for i in stride(from: ys.count - 2, through: 0, by: -1)
                where ys[i] > ys[i + 1] - labelPitch {
                    ys[i] = ys[i + 1] - labelPitch
                }
            }
            for (slot, index) in indices.enumerated() {
                let callout = callouts[index]
                func radialPoint(_ radius: CGFloat) -> CGPoint {
                    CGPoint(
                        x: center.x + CGFloat(sin(callout.midAngle)) * radius,
                        y: center.y - CGFloat(cos(callout.midAngle)) * radius
                    )
                }
                let start = radialPoint(outerRadius + edgeGap)
                let bend = radialPoint(elbowRadius)
                let isRight = radialSide == .right
                let end = CGPoint(
                    x: bend.x + (isRight ? horizontalRun : -horizontalRun),
                    y: ys[slot]
                )
                var line = Path()
                line.move(to: start)
                line.addLine(to: bend)
                line.addLine(to: end)
                context.stroke(line, with: .color(callout.color), lineWidth: 1)
                let labelPoint = CGPoint(
                    x: end.x + (isRight ? labelPad : -labelPad),
                    y: end.y
                )
                context.draw(
                    callout.name,
                    at: labelPoint,
                    anchor: UnitPoint(x: isRight ? 0 : 1, y: 0.5)
                )
            }
        }
    }

    /// The longest prefix of `name` (ellipsized) that fits `maxWidth` at
    /// the callout font, measured through the canvas context so dynamic
    /// type is honored.
    private static func fittedLabel(
        _ name: String,
        maxWidth: CGFloat,
        in context: GraphicsContext
    ) -> Text {
        func measured(_ text: Text) -> CGFloat {
            context.resolve(text).measure(in: CGSize(width: 10_000, height: 10_000)).width
        }
        let styled: (String) -> Text = {
            Text(verbatim: $0)
                .font(.caption2)
                .foregroundStyle(Color.primary)
        }
        guard measured(styled(name)) > maxWidth else { return styled(name) }
        var low = 0
        var high = name.count
        while low < high {
            let mid = (low + high + 1) / 2
            if measured(styled(name.prefix(mid) + "…")) <= maxWidth {
                low = mid
            } else {
                high = mid - 1
            }
        }
        return styled(name.prefix(low) + "…")
    }
}
