//
//  BudgetCardView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/15.
//

import SwiftUI

/// The dashboard's budget card (FR2): 本月日常预算 / 日常已花 / 日常剩余
/// (hero) / 日均还能花 / 不计入日常预算, plus the year-to-date line pushing the
/// monthly breakdown. Shown only when a budget is set — the spec forbids
/// any onboarding hint otherwise. The card follows the dashboard's selected
/// month; the daily figure only renders for the real current month, where
/// "days left" means anything.
struct BudgetCardView: View {
    @Environment(BackgroundSettings.self) private var backgroundSettings
    /// Push flag for the yearly breakdown, owned by DashboardView: the
    /// `navigationDestination` registration must sit outside the entry
    /// list's lazy row this card renders in (a registration inside a List
    /// is ignored in a future release), so the card only raises the flag.
    @Binding var isYearDetailPresented: Bool

    let month: BudgetMonthSummary
    let year: BudgetYear?
    var currency: String?
    /// False when the user stepped back to a past month — "日均还能花" is
    /// meaningless there and the daily hint hides.
    var isCurrentMonth: Bool
    /// The two drill-downs the dashboard owns: 日常已花 (budget-counted
    /// expenses) and 不计入日常预算 (the per-entry budget opt-outs). The columns
    /// become tappable with a trailing chevron, like the stat block's
    /// expense/income drills; nil keeps a column inert.
    var spentAction: (() -> Void)? = nil
    var excludedAction: (() -> Void)? = nil

    /// FR6's status ladder colors the hero figure: yellow from 80%, red
    /// from 100% — the spec's 卡片变黄/变红 lives only on the remaining
    /// amount now (2026-09-16 user ruling); the card's background stays
    /// the static card surface like the expense stat card's.
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

            // The month's consumption progress — the same thin ratio bar
            // the category budget card's rows carry (green/yellow/red
            // ladder over spent ÷ budget).
            BudgetProgressBar(
                spentCents: month.countedCents,
                budgetCents: month.budgetCents
            )
            .padding(.horizontal, 6)

            // Equal columns with the label above the figure: inline
            // label+value pairs shared one line, so long amounts squeezed
            // the neighbors out of the visible width.
            HStack(spacing: 12) {
                stat(
                    L10n.string("budget.spent", defaultValue: "Spent"),
                    value: amount(month.countedCents),
                    action: spentAction
                )
                if isCurrentMonth {
                    stat(
                        L10n.string("budget.daily", defaultValue: "Daily left"),
                        value: amount(dailyAvailableCents)
                    )
                }
                stat(
                    L10n.string("budget.excluded", defaultValue: "Excluded"),
                    value: amount(month.excludedCents),
                    action: excludedAction
                )
            }
            .padding(.horizontal, 6)

            if let year {
                // Not a NavigationLink: inside a List row one would append
                // the system chevron next to the drawn one AND make the
                // whole header row tap-to-navigate; the button keeps the
                // gesture on the annual line only.
                Button {
                    isYearDetailPresented = true
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
                    // Caption text alone is a ~16pt-tall strip; lift the
                    // row to the 44pt HIG minimum so the whole line is
                    // the tap target.
                    .frame(maxWidth: .infinity, minHeight: 44)
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
                .fill(backgroundSettings.cardSurface)
        )
        .glassRim(cornerRadius: 20)
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

    /// One stats column: caption label above the semibold figure, each
    /// column claiming an equal share so an amount can only truncate its
    /// own column, never push its neighbors off the card. With an
    /// `action` the title line gains the disclosure chevron and the whole
    /// column becomes one tap target — a plain gesture like the stat
    /// block's columns, so the figures keep their inert colors.
    @ViewBuilder
    private func stat(
        _ label: String,
        value: String,
        action: (() -> Void)? = nil
    ) -> some View {
        let figures = VStack(alignment: .leading, spacing: 2) {
            statTitleLine(label, showsDisclosure: action != nil)
            Text(value)
                .font(.caption.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(Color.primary)
                .lineLimit(1)
        }
        Group {
            if let action {
                figures.statTapTarget(action: action)
            } else {
                figures
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func annualValue(_ year: BudgetYear) -> String? {
        guard year.netCents != 0 else { return nil }
        return Money.format(Double(abs(year.netCents)) / 100, currency: currency)
    }
}
