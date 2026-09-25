//
//  OverviewCardView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/15.
//

import SwiftUI

/// The dashboard's overview card (FR2), three sections in one surface:
/// the month's expense/income/net stat block on top, the monthly budget
/// as one tappable line (the calendar glyph draws the spent share, the
/// remainder rides FR6's ladder — pushing `MonthlyBudgetDetailView`,
/// where the total, the daily figure and the journal drills live), and
/// the annual category budgets' trigger line (the over/near tally,
/// severity-tinted — pushing `CategoryBudgetDetailView`). The standalone
/// stats card, the standalone budget card, and the standalone category
/// card all merged into this one; the year's month-by-month table is
/// reachable from the monthly page (2026-09-24 user rulings).
///
/// Every section is data-driven: nil stats render the stat block's
/// placeholders (a guest's dashboard reads exactly the old stats card),
/// a nil month drops the budget line, and the category line needs a
/// non-empty budgeted set.
struct OverviewCardView: View {
    @Environment(BackgroundSettings.self) private var backgroundSettings

    /// The selected month's stats totals — the top section. nil renders
    /// the stat block's placeholder states (the guest gate stays the
    /// host's concern, exactly the stats card's isReportingEnabled rule).
    var statsTotals: DashboardMonth?
    var statsExpenseAction: (() -> Void)? = nil
    var statsIncomeAction: (() -> Void)? = nil

    /// The selected month's budget summary — nil when the year budget is
    /// closed while category budgets live on (the card degrades to the
    /// stats block plus the category section alone; the budget line —
    /// and with it the monthly push — disappears with it).
    var month: BudgetMonthSummary?
    /// The annual category budgets' report — the trigger line.
    var categoryBudget: CategoryBudgetReport?
    var currency: String?
    /// Push flag for the monthly budget's page (the budget line's tap) —
    /// page-owned like `isCategoryDetailPresented`, registered outside the
    /// entry list's lazy row for the same contract.
    @Binding var isMonthDetailPresented: Bool
    /// Push flag for the annual category budgets' page (the trigger
    /// line's tap).
    @Binding var isCategoryDetailPresented: Bool

    /// FR6's status ladder colors the remaining figure: yellow from 80%,
    /// red from 100% — the spec's 卡片变黄/变红 lives only on the remaining
    /// amount now (2026-09-16 user ruling).
    private var tint: Color? {
        guard let month else { return nil }
        return BudgetMath.status(countedCents: month.countedCents, budgetCents: month.budgetCents).figureTint
    }

    /// The month's budget consumption, 0…1 — drives the budget icon's
    /// variable draw (the circle's stroke fills to the spent share).
    private var usageRatio: Double {
        guard let month, month.budgetCents > 0 else { return 0 }
        return min(Double(month.countedCents) / Double(month.budgetCents), 1)
    }

    /// The categories' combined consumption, 0…1 — the same variable draw
    /// on the category trigger's icon: total spent over total budget.
    private var categoryUsageRatio: Double {
        guard let categories = categoryBudget?.categories else { return 0 }
        let spent = categories.reduce(0) { $0 + $1.spentCents }
        let budget = categories.reduce(0) { $0 + $1.budgetCents }
        guard budget > 0 else { return 0 }
        return min(Double(spent) / Double(budget), 1)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            StatSummaryBlock(
                totals: statsTotals,
                currency: currency,
                expenseAction: statsExpenseAction,
                incomeAction: statsIncomeAction,
                monthPrefixedLabels: true,
                drawsBackground: false
            )

            if let month {
                Divider()
                budgetSection(month)
            }

            if categoryTally != nil {
                Divider()
                categorySection
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

    /// The budget section, reduced to the single-line form (2026-09-24
    /// user ruling — the total, the daily figure and the spent/excluded
    /// drills moved to `MonthlyBudgetDetailView`): the month's budget on
    /// the left, the status-tinted remainder over the budget on the
    /// right, pushing the detail page.
    private func budgetSection(_ month: BudgetMonthSummary) -> some View {
        disclosureLine(
            icon: "calendar.circle",
            variableValue: usageRatio,
            title: L10n.string("budget.monthly", defaultValue: "Monthly Budget"),
            accessibilityHint: L10n.string("budget.monthly.hint", defaultValue: "View monthly budget details"),
            action: { isMonthDetailPresented = true }
        ) {
            Text(amount(month.remainingCents))
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(tint ?? Color.primary)
                .lineLimit(1)
            Text("/ \(amount(month.budgetCents))")
                .font(.caption)
                .monospacedDigit()
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }

    /// The annual category budgets' section: one tally line at rest (the
    /// over/near phrasing, severity-tinted); tapping pushes the category
    /// budgets' page (the in-card expansion became a page — 2026-09-24
    /// user ruling — after the List row-resize hop proved unfixable in
    /// place). Same disclosure line as the budget section above.
    private var categorySection: some View {
        disclosureLine(
            icon: "bookmark.circle",
            variableValue: categoryUsageRatio,
            title: L10n.string("categoryBudget.card.title", defaultValue: "Annual Category Budgets"),
            accessibilityHint: L10n.string("categoryBudget.card.toggleHint", defaultValue: "View annual category budgets"),
            action: { isCategoryDetailPresented = true }
        ) {
            if let tally = categoryTally {
                categorySegment(tally)
            }
        }
    }

    /// One disclosure row — the icon / title / trailing figure / chevron
    /// line both budget sections render, Button-wrapped for the push.
    /// The icon's variable value draws its stroke to the section's spent
    /// share; a bare `variableValue` renders nothing different on these
    /// glyphs — the explicit .draw mode engages it (2026-09-24, verified
    /// across five fill levels).
    private func disclosureLine(
        icon: String,
        variableValue: Double,
        title: String,
        accessibilityHint hint: String,
        action: @escaping () -> Void,
        @ViewBuilder trailing: () -> some View
    ) -> some View {
        Button {
            action()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: icon, variableValue: variableValue)
                    .symbolVariableValueMode(.draw)
                    .font(.subheadline)
                    .foregroundStyle(Color.accentColor)
                Text(title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer(minLength: 8)
                trailing()
                Image(systemName: "chevron.right")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            // The tightened height both lines share — the two disclosure
            // rows read as one rhythm.
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint(hint)
    }

    /// The category budgets' over/near tally over FR6's ladder (the same
    /// thresholds the year detail page's rows tint by); nil when no
    /// category budgets exist, hiding the year line's category segment.
    private var categoryTally: (over: Int, near: Int, total: Int)? {
        guard let categories = categoryBudget?.categories, !categories.isEmpty else {
            return nil
        }
        var over = 0
        var near = 0
        for row in categories {
            switch BudgetMath.status(countedCents: row.spentCents, budgetCents: row.budgetCents) {
            case .over: over += 1
            case .near: near += 1
            case .normal: break
            }
        }
        return (over, near, categories.count)
    }

    /// The category section's tally segment: the over/near count phrased
    /// by severity — any overspend leads (red), otherwise the near-misses
    /// (yellow), else the all-clear stays secondary. The section's title
    /// already names the context, so the segment is bare numbers.
    private func categorySegment(_ tally: (over: Int, near: Int, total: Int)) -> some View {
        let label: String
        let tint: Color?
        if tally.over > 0 {
            label = L10n.string(
                "budget.yearLine.categoriesOver",
                defaultValue: "%lld/%lld over",
                tally.over, tally.total
            )
            tint = .red
        } else if tally.near > 0 {
            label = L10n.string(
                "budget.yearLine.categoriesNear",
                defaultValue: "%lld near the limit",
                tally.near
            )
            tint = .yellow
        } else {
            label = L10n.string(
                "budget.yearLine.categoriesNormal",
                defaultValue: "%lld within budget",
                tally.total
            )
            tint = nil
        }
        return Text(label)
            .font(.caption)
            .foregroundStyle(tint ?? Color.secondary)
            .lineLimit(1)
    }

    private func amount(_ cents: Int) -> String {
        Money.format(Double(cents) / 100, currency: currency)
    }

}

