//
//  MonthTrendChartCard.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/17.
//

import Charts
import SwiftUI

/// The dashboard's month trend card: the selected month's per-day bars
/// (switchable to a line) under a metric tab — 收入 / 支出 / 结余, the net
/// being per-day income − expense. One series owns the whole chart at a
/// time (the tab is the legend), so the y-scale always fits that metric's
/// own range. The data is the daily-summary report at the `members` share
/// mode — each entry split across its participants, only ledger members'
/// slices counted — the same figures the stat card summarizes and the
/// journal's day headers render; the net tab's sum reconciles with the
/// stat card's 净额. Net marks follow the stat card's sign convention:
/// negative green (绿跌), non-negative red (红涨).
///
/// Pressing the chart scrubs: `chartXSelection`'s transient selection —
/// live while the finger is down — drops a hairline on the pressed day,
/// swaps the x axis to spell out the active day, and pins a tooltip in
/// the band the chart runs above its plot. On release the tooltip and
/// hairline STAY on the last pressed day (a sticky `activeDay`) so the
/// readout band never snaps empty; before the first press the bubble
/// defaults to today in the displayed month, or the displayed month's
/// last day in a past month. The selection rides the chart's own data
/// coordinates (same band-center anchor as the bars, so it can't
/// drift); the bubble and the hand-drawn axis are chartOverlay +
/// ChartProxy positioning.
struct MonthTrendChartCard: View {
    @Environment(BackgroundSettings.self) private var backgroundSettings

    let days: [DayIncomeExpense]
    var currency: String?
    /// Threaded locale — the axis labels must follow the in-app language
    /// override, not the device language.
    let locale: Locale
    /// Tapping the readout bubble drills into that day's entries. The
    /// card hands back the day and the metric's kind scope (结余 → nil =
    /// all kinds, transfers included — the day's journal lists every
    /// row even though the net figure nets income and expense only);
    /// nil disables drilling.
    var onSelectDay: ((Date, QuickEntryKind?) -> Void)? = nil

    @State private var style: TrendStyle = .bar
    /// The metric tab. Defaults to expense — spending is the everyday read.
    @State private var metric: TrendMetric
    /// The transient scrub value — the framework writes it while the
    /// finger is down and clears it on release; the sticky `activeDay`
    /// captures the last non-nil value so the readout persists.
    @State private var selectedDay: Date?
    /// The last pressed data day. The bubble, hairline, and readout stay
    /// parked on it after the finger lifts; nil means "no press yet" and
    /// the default day (today / latest data) shows instead.
    @State private var activeDay: Date?

    /// Chart geometry, in points: the plot keeps its established height,
    /// the chart runs `bubbleBand` taller above it (the tooltip's home)
    /// and `axisBand` below it — the strip where the hand-drawn day
    /// numbers live.
    private static let plotHeight: CGFloat = 126
    private static let bubbleBand: CGFloat = 48
    private static let axisBand: CGFloat = 26

    init(
        days: [DayIncomeExpense],
        currency: String?,
        locale: Locale,
        initialMetric: TrendMetric = .expense,
        onSelectDay: ((Date, QuickEntryKind?) -> Void)? = nil
    ) {
        self.days = days
        self.currency = currency
        self.locale = locale
        self.onSelectDay = onSelectDay
        _metric = State(initialValue: initialMetric)
    }

    enum TrendStyle: String, CaseIterable, Identifiable {
        case bar
        case line

        var id: String { rawValue }

        var symbol: String {
            switch self {
            case .bar: "chart.bar"
            case .line: "chart.xyaxis.line"
            }
        }

        var label: String {
            switch self {
            case .bar: L10n.string("dashboard.trendCard.styleBar", defaultValue: "Bars")
            case .line: L10n.string("dashboard.trendCard.styleLine", defaultValue: "Lines")
            }
        }
    }

    enum TrendMetric: String, CaseIterable, Identifiable {
        case expense
        case income
        case net

        var id: String { rawValue }

        var label: String {
            switch self {
            case .income: L10n.string("quick.kind.income", defaultValue: "Income")
            case .expense: L10n.string("quick.kind.expense", defaultValue: "Expense")
            case .net: L10n.string("dashboard.trendCard.metricNet", defaultValue: "Net")
            }
        }

        /// The card title names the active metric (支出统计图 / 收入统计图 /
        /// 结余统计图).
        var title: String {
            switch self {
            case .expense: L10n.string("dashboard.trendCard.titleExpense", defaultValue: "Expense Chart")
            case .income: L10n.string("dashboard.trendCard.titleIncome", defaultValue: "Income Chart")
            case .net: L10n.string("dashboard.trendCard.titleNet", defaultValue: "Net Chart")
            }
        }

        /// The drill kind the metric maps to — 结余 nets two kinds, so
        /// its drill opens the day's entries across all kinds.
        var drillKind: QuickEntryKind? {
            switch self {
            case .expense: .expense
            case .income: .income
            case .net: nil
            }
        }
    }

    /// One chartable point — a (day, amount) row of the active metric.
    struct TrendPoint: Identifiable {
        let date: Date
        let amount: Double

        var id: TimeInterval { date.timeIntervalSince1970 }
    }

    /// Every day of the displayed month, ascending — data days carry
    /// their figure, the rest read as ¥0 (no transactions). The full
    /// month is the scrubbing domain: any day has a readout, so the
    /// finger and the sticky bubble never fall off the data. Zero bars
    /// draw at zero height; the line style dips through them, which is
    /// the truthful read of a no-activity day.
    private var points: [TrendPoint] {
        guard let start = dataMonthStart, daysInMonth > 0 else { return [] }
        let calendar = Calendar.current
        let amountsByDay = Dictionary(
            days.compactMap { row -> (Int, Int)? in
                guard let date = Self.dayDate(row.day) else { return nil }
                let cents: Int = switch metric {
                case .income: row.incomeCents
                case .expense: row.expenseCents
                case .net: row.incomeCents - row.expenseCents
                }
                return (calendar.component(.day, from: date), cents)
            },
            uniquingKeysWith: { first, _ in first }
        )
        return (1...daysInMonth).compactMap { dayNumber in
            guard let date = calendar.date(byAdding: .day, value: dayNumber - 1, to: start) else { return nil }
            return TrendPoint(date: date, amount: Double(amountsByDay[dayNumber] ?? 0) / 100)
        }
    }

    /// The data's month, normalized to its first midnight. (The full-
    /// month `points` start on this same day, so this is also the chart
    /// domain's leading edge.)
    private var dataMonthStart: Date? {
        guard let first = days.compactMap({ Self.dayDate($0.day) }).min() else { return nil }
        return Calendar.current.date(from: Calendar.current.dateComponents([.year, .month], from: first))
    }

    /// Days in the displayed month — 0 when nothing is loaded.
    private var daysInMonth: Int {
        guard let start = dataMonthStart else { return 0 }
        return Calendar.current.range(of: .day, in: .month, for: start)?.count ?? 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            if points.isEmpty {
                ChartCardEmpty(systemName: "chart.bar")
            } else {
                chart
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(backgroundSettings.cardSurface)
        )
        .glassRim(cornerRadius: 20)
        // The sticky readout: capture each pressed day — every day of
        // the month carries a figure now, so any of them sticks. The
        // release itself arrives as a nil (the gesture clears its
        // binding) and must NOT overwrite the sticky day.
        .onChange(of: selectedDay) { _, day in
            if let day {
                activeDay = day
            }
        }
        .onChange(of: dataMonthStart) { _, _ in
            activeDay = nil
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                ChartCardBadge(systemName: "chart.bar.fill")
                Text(metric.title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Spacer(minLength: 8)
                Picker(
                    L10n.string("dashboard.trendCard.styleA11y", defaultValue: "Chart style"),
                    selection: $style
                ) {
                    ForEach(TrendStyle.allCases) { candidate in
                        Image(systemName: candidate.symbol)
                            .tag(candidate)
                            .accessibilityLabel(candidate.label)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .fixedSize()
            }
            segmentedPicker(
                L10n.string("dashboard.trendCard.metricA11y", defaultValue: "Income, expense or net"),
                selection: $metric,
                options: TrendMetric.allCases,
                label: \.label
            )
        }
    }

    private var chart: some View {
        Group {
            if let domain = monthDomain {
                chartCore.chartXScale(domain: domain)
            } else {
                chartCore
            }
        }
        // The bubble band above and the axis band below: the chart keeps
        // its plot height and the card pads a strip on each side — the
        // tooltip lives above, the hand-drawn day numbers below. The
        // overlay attaches OUTSIDE the paddings so its canvas spans all
        // three regions; the plot frame anchor resolves across the
        // spaces, and the scale x positions are unaffected (no
        // horizontal padding).
        .frame(height: Self.plotHeight)
        .padding(.top, Self.bubbleBand)
        .padding(.bottom, Self.axisBand)
        .chartOverlay { proxy in
            if let selected = displayedPoint {
                selectionBubble(for: selected, proxy: proxy)
            }
            axisLabels(proxy: proxy)
        }
    }

    /// The chart's marks and axes. The caller pins the x scale to the
    /// whole month (`.chartXScale`) so both styles share one scale —
    /// switching bar↔line can't shift positions — and days without
    /// entries read as gaps.
    private var chartCore: some View {
        Chart {
            ForEach(points) { point in
                switch style {
                case .bar:
                    BarMark(
                        x: .value("day", point.date, unit: .day),
                        y: .value("amount", point.amount)
                    )
                    .foregroundStyle(color(for: point.amount))
                case .line:
                    LineMark(
                        x: .value("day", bandCenter(point.date)),
                        y: .value("amount", point.amount)
                    )
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(color(for: point.amount))
                    PointMark(
                        x: .value("day", bandCenter(point.date)),
                        y: .value("amount", point.amount)
                    )
                    .foregroundStyle(color(for: point.amount))
                }
            }
            // The active day's hairline at the same band-center anchor
            // the bars and line points use. The old emphasis dot is
            // gone: the active day now lives on the hand-drawn axis
            // (`axisLabels`) while pressing, which reads at a glance.
            if let selected = displayedPoint {
                RuleMark(x: .value("selected", bandCenter(selected.date)))
                    .foregroundStyle(Color.primary.opacity(0.25))
                    .lineStyle(.init(lineWidth: 1))
            }
        }
        .chartXAxis(.hidden)
        .chartYAxis {
            AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { value in
                AxisGridLine()
                AxisValueLabel {
                    if let number = value.as(Double.self) {
                        Text(compact(number))
                    }
                }
            }
        }
        .chartLegend(.hidden)
        // The scrub gesture: live while the finger is down, nil on
        // release — `onChange` hands each pressed day to the sticky
        // `activeDay`, so the readout outlives the touch.
        .chartXSelection(value: $selectedDay)
    }

    /// Runs `body` with the plot's frame resolved into the overlay's
    /// coordinate space — the shared GeometryReader/`plotFrame` unwrap
    /// every overlay drawable (bubble, axis labels) goes through.
    private func plotSpace(
        _ proxy: ChartProxy,
        @ViewBuilder body: @escaping (CGRect) -> some View
    ) -> some View {
        GeometryReader { geo in
            if let plotFrame = proxy.plotFrame {
                body(geo[plotFrame])
            }
        }
    }

    /// The x axis, drawn by hand in the chart overlay: framework axis
    /// labels don't center on their ticks (measured: a constant leading
    /// offset that even varies with glyph count), so the card owns the
    /// geometry — each day number centers exactly on its band-center x,
    /// the same anchor the bars, line points, hairline, and bubble use.
    /// While the finger is down only the pressed day shows, in accent;
    /// otherwise the sparse every-7th-day ticks (the sticky bubble's day
    /// stays marked by the hairline). Bare digits, never the localized
    /// 日 suffix, so zh and en render identically.
    private func axisLabels(proxy: ChartProxy) -> some View {
        plotSpace(proxy) { plot in
            ForEach(axisTickDates, id: \.timeIntervalSince1970) { date in
                if let relX = proxy.position(forX: date) {
                    // Plot-relative → overlay space, via the anchor.
                    let x = plot.minX + relX
                    let isActive = selectedDay.map {
                        Calendar.current.isDate($0, inSameDayAs: date)
                    } ?? false
                    Text(verbatim: Self.dayNumber(date))
                        .font(isActive ? .caption.weight(.semibold) : .caption)
                        .foregroundStyle(isActive ? Color.accentColor : Color.secondary)
                        .position(
                            x: min(max(x, plot.minX + 8), plot.maxX - 8),
                            y: plot.maxY + 13
                        )
                        // Labels sit inside the chart frame — keep
                        // them transparent to the scrub gesture.
                        .allowsHitTesting(false)
                }
            }
        }
    }

    /// The axis ticks: while the finger is down, only the pressed day
    /// (at its band-center instant); otherwise the sparse every-7th-day
    /// ticks. The released state keeps the sparse month orientation —
    /// the sticky day is marked by the hairline and the bubble instead.
    private var axisTickDates: [Date] {
        if let selectedDay, let pressed = point(on: selectedDay) {
            return [bandCenter(pressed.date)]
        }
        return sparseTickDates
    }

    /// The x scale covers the WHOLE month the data belongs to — not just
    /// the days with entries — so both styles share one axis and empty
    /// days read as gaps. The range is that month's first midnight
    /// through the next month's first midnight (the last bar's band
    /// ends exactly there).
    private var monthDomain: ClosedRange<Date>? {
        guard let start = dataMonthStart,
              let end = Calendar.current.date(byAdding: .month, value: 1, to: start)
        else { return nil }
        return start...end
    }

    /// The unpressed x ticks: every 7th day of the month, each expressed
    /// at its band-center instant. Automatic date ticks sit on day
    /// boundaries — the band's left edge — so their labels land in the
    /// gaps BETWEEN bars; ticking at the band centers makes each label
    /// center exactly under its bar / line point.
    private var sparseTickDates: [Date] {
        guard let start = dataMonthStart, daysInMonth > 0 else { return [] }
        let calendar = Calendar.current
        return (1...daysInMonth)
            .filter { $0 % 7 == 0 }
            .compactMap { day -> Date? in
                guard let dayStart = calendar.date(byAdding: .day, value: day - 1, to: start) else { return nil }
                return bandCenter(dayStart)
            }
    }

    /// The band-center anchor. Unit-day bars span their whole day, so a
    /// bar's visual center sits at midday — line points, the selection
    /// hairline, and the bubble must plot there too, or they ride half
    /// a band left of the bars (the bar↔line x mismatch this card
    /// shipped with). Calendar-based so DST transitions stay sane.
    private func bandCenter(_ date: Date) -> Date {
        Calendar.current.date(byAdding: .hour, value: 12, to: date) ?? date
    }

    /// The axis renders bare day numbers — digits only, locale-free.
    private static func dayNumber(_ date: Date) -> String {
        String(Calendar.current.component(.day, from: date))
    }

    /// The data point whose figure the card surfaces: the pressed day
    /// while scrubbing (any day of the month — gaps read as ¥0), the
    /// last pressed day after the finger lifts, and the default day
    /// before the first press.
    private var displayedPoint: TrendPoint? {
        if let selectedDay, let pressed = point(on: selectedDay) { return pressed }
        if let activeDay, let kept = point(on: activeDay) { return kept }
        return defaultPoint
    }

    private func point(on date: Date) -> TrendPoint? {
        points.first { Calendar.current.isDate(date, inSameDayAs: $0.date) }
    }

    /// The load-time default: today when the displayed month is the
    /// current one — regardless of whether today has entries (¥0 is the
    /// truthful read) — else the month's last day. Pure so the rule
    /// stays unit-testable.
    nonisolated static func defaultSelectionDayNumber(todayDayNumber: Int?, daysInMonth: Int) -> Int? {
        guard daysInMonth > 0 else { return nil }
        return todayDayNumber ?? daysInMonth
    }

    private var defaultPoint: TrendPoint? {
        guard let first = points.first else { return nil }
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let todayDayNumber = calendar.isDate(today, equalTo: first.date, toGranularity: .month)
            ? calendar.component(.day, from: today)
            : nil
        guard let number = Self.defaultSelectionDayNumber(todayDayNumber: todayDayNumber, daysInMonth: points.count),
              points.indices.contains(number - 1)
        else { return nil }
        return points[number - 1]
    }

    /// The active day's tooltip: a material bubble living in the band
    /// the chart reserves above its plot — the plot never shrinks for
    /// it and it never covers bars, gridlines, or labels. Still
    /// x-centered on the day, clamped inside the plot so it can't spill
    /// past the card. The bubble is ALSO the drill target: tapping it
    /// opens the day's entries (`onSelectDay`, the metric scoping the
    /// kind, 结余 drilling all kinds). It lives in the band above the
    /// plot, outside the chart's scrub-gesture area, so hit-testing it
    /// costs the gesture nothing. ChartProxy positions live in the
    /// chart's coordinate space; `plotFrame` (resolved through the
    /// overlay's GeometryReader) provides the plot bounds — its top
    /// edge bounds the band from below.
    private func selectionBubble(for point: TrendPoint, proxy: ChartProxy) -> some View {
        plotSpace(proxy) { plot in
            if let relX = proxy.position(forX: bandCenter(point.date)) {
                // Plot-relative → overlay space, via the anchor.
                let x = plot.minX + relX
                let bubbleHalf: CGFloat = 52
                let bubbleHeight: CGFloat = 44
                let bubbleX = min(max(x, plot.minX + bubbleHalf), plot.maxX - bubbleHalf)
                let bubbleY = plot.minY - bubbleHeight / 2 - 4
                VStack(spacing: 1) {
                    Text(point.date, format: .dateTime.month().day().locale(locale))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text(Money.format(point.amount, currency: currency))
                        .font(.footnote.weight(.semibold).monospacedDigit())
                        .foregroundStyle(color(for: point.amount))
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                }
                // Fixed frame on both axes: the 44pt height the band
                // geometry assumes holds at every Dynamic Type size
                // (the text scales down to fit instead of growing).
                .frame(width: bubbleHalf * 2, height: bubbleHeight)
                .padding(.vertical, 6)
                .background {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(.regularMaterial)
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .strokeBorder(.quaternary)
                }
                .shadow(color: .black.opacity(0.15), radius: 5, y: 2)
                // The tap target and VoiceOver element must be the
                // bubble's own bounds: attached after .position they
                // would stretch across the whole overlay canvas — every
                // tap anywhere drilled, and the scrub gesture starved.
                .contentShape(Rectangle())
                .onTapGesture {
                    onSelectDay?(point.date, metric.drillKind)
                }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isButton)
                .position(x: bubbleX, y: bubbleY)
            }
        }
    }

    /// Income red / expense green; the net follows the stat card's
    /// finance convention — negative green (绿跌), non-negative red (红涨).
    private func color(for amount: Double) -> Color {
        switch metric {
        case .income: .income
        case .expense: .expense
        case .net: amount < 0 ? .expense : .income
        }
    }

    /// Axis amounts skip the currency symbol and collapse to compact
    /// magnitudes ("1.2万" / "12K") — the full figure lives in the stat
    /// card above and the day headers below.
    private func compact(_ value: Double) -> String {
        value.formatted(
            .number
                .notation(.compactName)
                .precision(.fractionLength(0))
                .locale(locale)
        )
    }

    /// The daily-summary's "yyyy-MM-dd" is the LOCAL day the server
    /// bucketed under the request's tz offset — parse it as local calendar
    /// components, never as a UTC instant (that would timezone-shift the
    /// bucket). Pure so the arithmetic stays unit-testable.
    nonisolated static func dayDate(_ day: String) -> Date? {
        let parts = day.split(separator: "-")
        guard parts.count == 3,
              let year = Int(parts[0]),
              let month = Int(parts[1]),
              let dayNumber = Int(parts[2])
        else { return nil }
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = dayNumber
        return Calendar.current.date(from: components)
    }
}
