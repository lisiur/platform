//
//  StatSummaryBlock.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

/// The expense card with the income and net figures inside it — the stats
/// component's overview block, reused wherever a window's ledger-wide
/// totals render (the journal's stat card). The expense hero tops the
/// card; income/net share a lower row of label-over-figure columns, the
/// budget card's inner stat-row arrangement.
struct StatSummaryBlock: View {
    /// The window's ledger-wide totals; nil renders placeholders.
    let totals: DashboardMonth?
    var currency: String?
    /// The window drills: a non-nil action makes the expense hero /
    /// income column a tappable control with a trailing chevron. The
    /// journal's own stat card passes nothing and stays inert.
    var expenseAction: (() -> Void)? = nil
    var incomeAction: (() -> Void)? = nil

    var body: some View {
        StatCard(
            icon: "wallet.bifold",
            label: L10n.string("account.type.expense", defaultValue: "Expense"),
            value: totals?.totalExpense,
            currency: currency,
            tone: .negative,
            footer: AnyView(
                HStack(spacing: 12) {
                    column(
                        L10n.string("account.type.income", defaultValue: "Income"),
                        value: totals?.totalIncome,
                        tone: .positive,
                        alignment: .leading,
                        action: incomeAction
                    )
                    column(
                        L10n.string("common.net", defaultValue: "Net"),
                        value: totals?.net,
                        // Finance convention: negative net green (绿跌),
                        // non-negative red (红涨).
                        tone: (totals?.net ?? 0) < 0 ? .negative : .positive,
                        alignment: .trailing
                    )
                }
                // The budget card insets its inner stat rows the same way,
                // so the stacked cards' figures align.
                .padding(.horizontal, 6)
            ),
            action: expenseAction
        )
    }

    /// One stats column: caption label above the tone-colored semibold
    /// figure. Income hugs the card's leading edge, net its trailing edge;
    /// each column still claims an equal share so a long amount can only
    /// truncate its own column, never push its neighbor off the card. With
    /// an `action` the title line gains the disclosure chevron and the
    /// whole column becomes one tap target — a plain gesture like the
    /// headline, so the figures keep their inert colors.
    @ViewBuilder
    private func column(
        _ label: String,
        value: Double?,
        tone: StatCard.Tone,
        alignment: HorizontalAlignment,
        action: (() -> Void)? = nil
    ) -> some View {
        let figures = VStack(alignment: alignment, spacing: 2) {
            statTitleLine(label, showsDisclosure: action != nil)
            Text(value.map { Money.format($0, currency: currency) } ?? "—")
                .font(.caption.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(tone.color ?? Color.primary)
                .lineLimit(1)
        }
        Group {
            if let action {
                figures.statTapTarget(action: action)
            } else {
                figures
            }
        }
        .frame(maxWidth: .infinity, alignment: Alignment(horizontal: alignment, vertical: .center))
    }
}
