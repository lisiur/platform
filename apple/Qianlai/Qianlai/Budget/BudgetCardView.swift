//
//  BudgetCardView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/15.
//

import SwiftUI

/// The dashboard's budget card (FR2): 本月日常预算 / 日常已花 / 日常剩余
/// (hero) / 日均还能花 / 不计入预算, plus the year-to-date line pushing the
/// monthly breakdown. Shown only when a budget is set — the spec forbids
/// any onboarding hint otherwise. The card follows the dashboard's selected
/// month; the daily figure only renders for the real current month, where
/// "days left" means anything.
struct BudgetCardView: View {
    @Environment(BackgroundSettings.self) private var backgroundSettings

    let month: BudgetMonthSummary
    let year: BudgetYear?
    var currency: String?
    /// False when the user stepped back to a past month — "日均还能花" is
    /// meaningless there and the daily hint hides.
    var isCurrentMonth: Bool

    /// FR6's status ladder drives the card's color: yellow from 80%, red
    /// from 100% — the spec's 卡片变黄/变红. The tint recolors both the
    /// card's background wash and the hero figure.
    private var tint: Color? {
        switch BudgetMath.status(countedCents: month.countedCents, budgetCents: month.budgetCents) {
        case .normal: nil
        case .near: .yellow
        case .over: .red
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                Image(systemName: "chart.bar")
                    .font(.system(size: 20))
                    .foregroundStyle(Color.accentColor)
                    .frame(width: 40, height: 40)
                    .background(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Color.accentColor.opacity(0.12))
                    )
                VStack(alignment: .leading, spacing: 2) {
                    Text(L10n.string("budget.monthly", defaultValue: "Monthly Budget"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Text(amount(month.budgetCents))
                        .font(.system(.title3, design: .rounded, weight: .bold))
                        .monospacedDigit()
                        .lineLimit(1)
                }
                Spacer()
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(L10n.string("budget.remaining", defaultValue: "Remaining"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(amount(month.remainingCents))
                    .font(.system(.largeTitle, design: .rounded, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(tint ?? Color.primary)
                    .lineLimit(1)
            }

            HStack(spacing: 16) {
                hint(L10n.string("budget.spent", defaultValue: "Spent"), value: amount(month.countedCents))
                if isCurrentMonth {
                    hint(
                        L10n.string("budget.daily", defaultValue: "Daily left"),
                        value: amount(dailyAvailableCents)
                    )
                }
                hint(
                    L10n.string("budget.excluded", defaultValue: "Excluded"),
                    value: amount(month.excludedCents)
                )
            }
            .padding(.horizontal, 6)

            if let year {
                NavigationLink {
                    BudgetYearDetailView()
                } label: {
                    HStack(spacing: 4) {
                        Text(year.annualStatusLabel)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if let annualValue = annualValue(year) {
                            Text(annualValue)
                                .font(.caption.weight(.semibold))
                                .monospacedDigit()
                                .foregroundStyle(Color.primary)
                                .lineLimit(1)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 6)
                .accessibilityHint(L10n.string("budget.yearDetail", defaultValue: "Yearly breakdown"))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(tint.map { $0.opacity(0.16) } ?? backgroundSettings.cardSurface)
        )
    }

    private var dailyAvailableCents: Int {
        BudgetMath.dailyAvailableCents(
            remainingCents: month.remainingCents,
            daysRemaining: BudgetMath.daysRemaining(inMonthOf: Date())
        )
    }

    private func amount(_ cents: Int) -> String {
        Money.format(Double(cents) / 100, currency: currency)
    }

    private func hint(_ label: String, value: String) -> some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.caption.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(Color.primary)
                .lineLimit(1)
        }
    }

    private func annualValue(_ year: BudgetYear) -> String? {
        guard year.netCents != 0 else { return nil }
        return Money.format(Double(abs(year.netCents)) / 100, currency: currency)
    }
}
