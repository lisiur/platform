//
//  CategoryBreakdownCard.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/17.
//

import Charts
import SwiftUI

/// The dashboard's composition card: the selected month's per-category
/// totals as a donut with a full legend beneath, switchable between the
/// expense and income sides. The data is the category-summary report — the
/// daily summary's line-level accounting split keyed per account, so it
/// reconciles with the trend card beside it. A pie can't draw a
/// non-positive slice: zero/negative nets (offsetting corrections) stay out
/// of both the donut and the legend, and the center total is the sum of
/// what's actually shown.
struct CategoryBreakdownCard: View {
    @Environment(BackgroundSettings.self) private var backgroundSettings

    let summary: CategorySummaryResponse
    var currency: String?
    /// Threaded locale — the percentage labels must follow the in-app
    /// language override, not the device language.
    let locale: Locale

    @State private var side: Side = .expense

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
        (side == .expense ? summary.expense : summary.income)
            .filter { $0.amountCents > 0 }
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
        HStack(spacing: 12) {
            ChartCardBadge(systemName: "chart.pie.fill")
            Text(L10n.string("dashboard.compositionCard.title", defaultValue: "Breakdown"))
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
            Spacer(minLength: 8)
            Picker(
                L10n.string("dashboard.compositionCard.sideA11y", defaultValue: "Income or expense"),
                selection: $side
            ) {
                ForEach(Side.allCases) { candidate in
                    Text(candidate.label).tag(candidate)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .fixedSize()
        }
    }

    private var donut: some View {
        Chart {
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                SectorMark(
                    angle: .value("amount", Double(row.amountCents)),
                    innerRadius: .ratio(0.618),
                    angularInset: 1
                )
                .cornerRadius(3)
                .foregroundStyle(Self.color(index))
            }
        }
        .chartLegend(.hidden)
        .frame(width: 170, height: 150)
        .frame(maxWidth: .infinity)
        .overlay {
            VStack(spacing: 2) {
                Text(L10n.string("dashboard.compositionCard.total", defaultValue: "Total"))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(Money.format(Double(totalCents) / 100, currency: currency))
                    .font(.callout.weight(.bold).monospacedDigit())
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .padding(.horizontal, 28)
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

    private func legendRow(_ index: Int, _ row: CategoryAmountRow) -> some View {
        HStack(spacing: 8) {
            Circle()
                .fill(Self.color(index))
                .frame(width: 8, height: 8)
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
                .frame(minWidth: 34, alignment: .trailing)
        }
        .padding(.vertical, 5)
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
}
