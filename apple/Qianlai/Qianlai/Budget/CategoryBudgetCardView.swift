//
//  CategoryBudgetCardView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/21.
//

import SwiftUI

/// The dashboard's annual category budget card: one row per budgeted
/// category — spent vs its whole-year budget over a thin progress bar —
/// for the CURRENT year, independent of the month stepper. Rows drill into
/// the year's journal filtered to the category. Renders only when the year
/// has category budgets (empty report = no card, like the budget card).
struct CategoryBudgetCardView: View {
    @Environment(BackgroundSettings.self) private var backgroundSettings

    let report: CategoryBudgetReport
    /// One row's drill-down — the year's expenses under that category.
    var onSelect: (CategoryBudgetRow) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                Image(systemName: "tag.circle")
                    .font(.system(size: 20))
                    .foregroundStyle(Color.accentColor)
                    .frame(width: 40, height: 40)
                    .background(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Color.accentColor.opacity(0.12))
                    )
                VStack(alignment: .leading, spacing: 2) {
                    Text(L10n.string("categoryBudget.card.title", defaultValue: "Annual Category Budgets"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Text(String(report.year))
                        .font(.system(.title3, design: .rounded, weight: .bold))
                        .monospacedDigit()
                        .lineLimit(1)
                }
                Spacer()
            }

            VStack(alignment: .leading, spacing: 12) {
                ForEach(report.categories, id: \.accountId) { row in
                    rowView(row)
                }
            }
            .padding(.horizontal, 6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(backgroundSettings.cardSurface)
        )
        .glassRim(cornerRadius: 20)
    }

    /// One category row: icon, name, trailing spent/budget, and the thin
    /// ratio bar beneath. The whole row is the drill target (plain gesture
    /// like the budget card's stat columns, so the figures keep their
    /// colors).
    private func rowView(_ row: CategoryBudgetRow) -> some View {
        Button {
            onSelect(row)
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(row.displayIcon)
                        .font(.subheadline)
                    Text(row.displayName)
                        .font(.subheadline)
                        .foregroundStyle(Color.primary)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    Text(amount(row.spentCents))
                        .font(.caption.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(statusTint(row) ?? Color.primary)
                        .lineLimit(1)
                    Text("/ \(amount(row.budgetCents))")
                        .font(.caption)
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                // The thin ratio bar: spent ÷ budget, capped at full — a
                // zero budget overspends on the first spent cent (the
                // status ladder's "预算为 0 视为有效预算").
                GeometryReader { proxy in
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(Color.secondary.opacity(0.15))
                        Capsule()
                            .fill(statusTint(row) ?? Color.accentColor)
                            .frame(width: proxy.size.width * ratio(row))
                    }
                }
                .frame(height: 4)
            }
            .frame(maxWidth: .infinity, minHeight: 32)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint(L10n.string("categoryBudget.card.drillHint", defaultValue: "View this year's expenses"))
    }

    /// FR6's ladder, pure ratios the monthly card shares: yellow from 80%,
    /// red from 100%.
    private func statusTint(_ row: CategoryBudgetRow) -> Color? {
        switch BudgetMath.status(countedCents: row.spentCents, budgetCents: row.budgetCents) {
        case .normal: nil
        case .near: .yellow
        case .over: .red
        }
    }

    private func ratio(_ row: CategoryBudgetRow) -> Double {
        // Refunds credited against the expense account can drag the net
        // below zero — the bar never runs backwards.
        guard row.budgetCents > 0 else { return row.spentCents > 0 ? 1 : 0 }
        return max(0, min(Double(row.spentCents) / Double(row.budgetCents), 1))
    }

    private func amount(_ cents: Int) -> String {
        Money.format(Double(cents) / 100, currency: report.currency)
    }
}
