//
//  MonthTrendChartCard.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/17.
//

import Charts
import SwiftUI

/// The dashboard's month trend card: the selected month's per-day
/// income/expense as a grouped bar chart, switchable to a line. The data is
/// the daily-summary report at the `members` share mode — each entry split
/// across its participants, only ledger members' slices counted — the same
/// figure the stat card summarizes and the journal's day headers render,
/// so both charts on this page reconcile with the stat card and the list
/// beneath them.
struct MonthTrendChartCard: View {
    @Environment(BackgroundSettings.self) private var backgroundSettings

    let days: [DayIncomeExpense]
    var currency: String?
    /// Threaded locale — the axis labels must follow the in-app language
    /// override, not the device language.
    let locale: Locale

    @State private var style: TrendStyle = .bar
    /// Series scope: both sides share one y-scale, so a salary spike can
    /// crush the daily expense bars into baseline slivers — expense-only
    /// re-aims the scale at the expense range alone.
    @State private var scope: TrendScope = .both

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

    enum TrendScope: String, CaseIterable, Identifiable {
        case both
        case expenseOnly

        var id: String { rawValue }

        var label: String {
            switch self {
            case .both:
                L10n.string("dashboard.trendCard.scopeBoth", defaultValue: "Income & Expense")
            case .expenseOnly:
                L10n.string("dashboard.trendCard.scopeExpenseOnly", defaultValue: "Expense Only")
            }
        }
    }

    /// One chartable point in long format — a (series, day, amount) row —
    /// so both mark styles share one ForEach and the legend colors come
    /// from the same series switch.
    struct TrendPoint: Identifiable {
        let series: Series
        let date: Date
        let amount: Double

        var id: String {
            "\(series.rawValue)-\(date.timeIntervalSince1970)"
        }

        enum Series: String, Plottable {
            case income
            case expense
        }
    }

    private var points: [TrendPoint] {
        let parsed = days
            .compactMap { day -> (date: Date, income: Int, expense: Int)? in
                guard let date = Self.dayDate(day.day) else { return nil }
                return (date, day.incomeCents, day.expenseCents)
            }
            .sorted { $0.date < $1.date }
        let result = parsed.flatMap { day in
            [
                TrendPoint(series: .income, date: day.date, amount: Double(day.income) / 100),
                TrendPoint(series: .expense, date: day.date, amount: Double(day.expense) / 100),
            ]
        }
        return scope == .both ? result : result.filter { $0.series == .expense }
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
        HStack(spacing: 12) {
            ChartCardBadge(systemName: "chart.bar.fill")
            VStack(alignment: .leading, spacing: 3) {
                Text(L10n.string("dashboard.trendCard.title", defaultValue: "Income & Expense"))
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                HStack(spacing: 10) {
                    if scope == .both {
                        legendDot(Color.income, L10n.string("quick.kind.income", defaultValue: "Income"))
                    }
                    legendDot(Color.expense, L10n.string("quick.kind.expense", defaultValue: "Expense"))
                }
            }
            Spacer(minLength: 8)
            // The dashboard month header's kind-filter idiom: a Picker-in-
            // Menu so UIKit draws the checkmark, activity on the icon by
            // tint alone.
            Menu {
                Picker(
                    L10n.string("dashboard.trendCard.scopeA11y", defaultValue: "Chart series"),
                    selection: $scope
                ) {
                    ForEach(TrendScope.allCases) { candidate in
                        Text(candidate.label).tag(candidate)
                    }
                }
            } label: {
                CircleIcon(
                    systemName: "line.3.horizontal.decrease",
                    isActive: scope == .expenseOnly
                )
            }
            .accessibilityLabel(L10n.string("dashboard.trendCard.scopeA11y", defaultValue: "Chart series"))
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
    }

    private func legendDot(_ color: Color, _ label: String) -> some View {
        HStack(spacing: 4) {
            Circle()
                .fill(color)
                .frame(width: 6, height: 6)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    private var chart: some View {
        Chart {
            ForEach(points) { point in
                switch style {
                case .bar:
                    if scope == .both {
                        BarMark(
                            x: .value("day", point.date, unit: .day),
                            y: .value("amount", point.amount)
                        )
                        .position(by: .value("series", point.series))
                        .foregroundStyle(color(for: point.series))
                    } else {
                        // Single series owns the whole day slot (no position
                        // grouping) and the y-scale fits the expense range.
                        BarMark(
                            x: .value("day", point.date, unit: .day),
                            y: .value("amount", point.amount)
                        )
                        .foregroundStyle(color(for: point.series))
                    }
                case .line:
                    LineMark(
                        x: .value("day", point.date),
                        y: .value("amount", point.amount)
                    )
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(color(for: point.series))
                    PointMark(
                        x: .value("day", point.date),
                        y: .value("amount", point.amount)
                    )
                    .foregroundStyle(color(for: point.series))
                }
            }
        }
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 5)) {
                AxisValueLabel(format: .dateTime.day().locale(locale))
            }
        }
        .chartYAxis {
            AxisMarks(position: .trailing, values: .automatic(desiredCount: 4)) { value in
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

    private func color(for series: TrendPoint.Series) -> Color {
        series == .income ? Color.income : Color.expense
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
