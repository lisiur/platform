//
//  CategoryBudgetDetailView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/24.
//

import SwiftUI

/// The annual category budgets' page behind the dashboard card's
/// 年度分类预算 line (2026-09-24 user ruling — the in-card expansion became
/// this page after the List row-resize hop proved unfixable in place). One
/// row per budgeted category — icon / name / spent/budget / ratio bar —
/// the whole row pushing the year's journal under that category's subtree.
/// Reads the live report off the shared ReportStore, like
/// `BudgetYearDetailView`, so edits that re-fetch the dashboard update
/// this page too. The drill is registered HERE, not reused from the
/// dashboard's `statDetailTarget`: a destination registered on the page
/// BELOW pushed this page, and triggering it from a pushed page replaces
/// this page instead of stacking (Lisiur: 返回直接到首页) — a page-owned
/// registration appends normally.
struct CategoryBudgetDetailView: View {
    @Environment(ReportStore.self) private var store
    @Environment(LedgerStore.self) private var ledgerStore
    @State private var drillTarget: StatDetailTarget?

    private var report: CategoryBudgetReport? { store.categoryBudget }
    private var currency: String? { store.budget?.currency }

    var body: some View {
        Group {
            if let report {
                List {
                    Section {
                        ForEach(report.categories, id: \.accountId) { row in
                            categoryRow(row)
                                .appCardRow()
                        }
                    }
                }
            } else {
                EmptyStateView(
                    message: L10n.string("categoryBudget.detail.empty", defaultValue: "No category budgets for this year yet"),
                    systemImage: "tag"
                )
            }
        }
        .appBackgroundSink()
        .navigationTitle(Text(L10n.string("categoryBudget.card.title", defaultValue: "Annual Category Budgets")))
        .inlineNavigationBarTitle()
        .navigationDestination(item: $drillTarget) { target in
            StatKindDetailView(
                ledger: target.ledger,
                filter: target.filter,
                // The row drill always carries the report's year window;
                // the fallback never fires.
                window: target.windowOverride ?? AppDates.monthWindow(),
                day: target.day,
                filters: target.filters
            )
        }
    }

    /// One category row: icon, name, trailing spent/budget, thin ratio
    /// bar. The whole row is the drill target — a tap gesture, not a
    /// Button, so the figures keep their ladder tints under touch.
    private func categoryRow(_ row: CategoryBudgetRow) -> some View {
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
            BudgetProgressBar(
                spentCents: row.spentCents,
                budgetCents: row.budgetCents
            )
        }
        .contentShape(Rectangle())
        .onTapGesture { drill(row) }
        .accessibilityHint(L10n.string("categoryBudget.card.drillHint", defaultValue: "View this year's expenses"))
    }

    /// The year's journal under the category's subtree (the server's
    /// parentAccountId filter — the account plus its direct children — is
    /// the closest journal-side match to the spent roll-up), unfiltered
    /// like every budget drill.
    private func drill(_ row: CategoryBudgetRow) {
        guard let report,
            let ledger = ledgerStore.activeLedger else { return }
        drillTarget = StatDetailTarget(
            ledger: ledger,
            filter: JournalDrillDown(
                kind: .expense,
                parentAccountId: row.accountId,
                categoryLabel: row.displayName
            ),
            day: nil,
            windowOverride: AppDates.yearWindow(report.year),
            filters: nil
        )
    }

    /// FR6's ladder tints the rows' spent figure: yellow from 80%, red
    /// from 100%; normal keeps the inert primary (the bar alone reads
    /// green — see `BudgetProgressBar`).
    private func statusTint(_ row: CategoryBudgetRow) -> Color? {
        BudgetMath.status(countedCents: row.spentCents, budgetCents: row.budgetCents).figureTint
    }

    private func amount(_ cents: Int) -> String {
        Money.format(Double(cents) / 100, currency: currency)
    }
}
