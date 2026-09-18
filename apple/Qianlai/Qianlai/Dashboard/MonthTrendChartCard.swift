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
struct MonthTrendChartCard: View {
    @Environment(BackgroundSettings.self) private var backgroundSettings

    let days: [DayIncomeExpense]
    var currency: String?
    /// Threaded locale — the axis labels must follow the in-app language
    /// override, not the device language.
    let locale: Locale

    @State private var style: TrendStyle = .bar
    /// The metric tab. Defaults to expense — spending is the everyday read.
    @State private var metric: TrendMetric

    init(
        days: [DayIncomeExpense],
        currency: String?,
        locale: Locale,
        initialMetric: TrendMetric = .expense
    ) {
        self.days = days
        self.currency = currency
        self.locale = locale
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
    }

    /// One chartable point — a (day, amount) row of the active metric.
    struct TrendPoint: Identifiable {
        let date: Date
        let amount: Double

        var id: TimeInterval { date.timeIntervalSince1970 }
    }

    private var points: [TrendPoint] {
        days
            .compactMap { day -> TrendPoint? in
                guard let date = Self.dayDate(day.day) else { return nil }
                let cents: Int = switch metric {
                case .income: day.incomeCents
                case .expense: day.expenseCents
                case .net: day.incomeCents - day.expenseCents
                }
                return TrendPoint(date: date, amount: Double(cents) / 100)
            }
            .sorted { $0.date < $1.date }
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
                        x: .value("day", point.date),
                        y: .value("amount", point.amount)
                    )
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(color(for: point.amount))
                    PointMark(
                        x: .value("day", point.date),
                        y: .value("amount", point.amount)
                    )
                    .foregroundStyle(color(for: point.amount))
                }
            }
        }
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 5)) {
                AxisValueLabel(format: .dateTime.day().locale(locale))
            }
        }
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
        .frame(height: 150)
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
