//
//  MonthlyBudgetDetailView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/24.
//

import SwiftUI

/// The monthly budget's page behind the overview card's 月度日常预算 line
/// (2026-09-24 user ruling — the card carries the single-line form, this
/// page carries the figures): 预算 / 日常剩余 / 日均还能花 in the overview
/// section (预算 opening the budget settings), 日常已花 / 不计入日常预算
/// drilling into their journal sets, and the entry to the year's
/// month-by-month table (`BudgetYearDetailView`). Reads the live report
/// off the shared ReportStore, like the other budget pages. The
/// dashboard is pinned to the current month, so 日均还能花 always means
/// something here.
struct MonthlyBudgetDetailView: View {
    @Environment(ReportStore.self) private var store
    @Environment(LedgerStore.self) private var ledgerStore
    @State private var drillTarget: StatDetailTarget?

    private var month: BudgetMonthSummary? { store.budget?.month }
    private var currency: String? { store.budget?.currency }

    var body: some View {
        Group {
            if let month {
                List {
                    Section {
                        // The month's total budget — tapping opens the
                        // budget settings page where it is set and edited.
                        NavigationLink {
                            BudgetSettingsView()
                        } label: {
                            figureRow(
                                L10n.string("budget.yearDetail.budget", defaultValue: "Budget"),
                                value: amount(month.budgetCents),
                                tint: nil
                            )
                        }
                        .appCardRow()
                        figureRow(
                            L10n.string("budget.remaining", defaultValue: "Remaining"),
                            value: amount(month.remainingCents),
                            tint: statusTint
                        )
                        .appCardRow()
                        figureRow(
                            L10n.string("budget.daily", defaultValue: "Daily left"),
                            value: amount(dailyAvailableCents),
                            tint: nil
                        )
                        .appCardRow()
                    }
                    Section {
                        drillRow(
                            L10n.string("budget.spent", defaultValue: "Spent"),
                            value: amount(month.countedCents),
                            isBudgetExcluded: false
                        )
                        .appCardRow()
                        drillRow(
                            L10n.string("budget.excluded", defaultValue: "Excluded"),
                            value: amount(month.excludedCents),
                            isBudgetExcluded: true
                        )
                        .appCardRow()
                    }
                    Section {
                        NavigationLink {
                            BudgetYearDetailView()
                        } label: {
                            Text(L10n.string("budget.yearDetail", defaultValue: "Yearly breakdown"))
                        }
                        .appCardRow()
                    }
                }
            } else {
                EmptyStateView(
                    message: L10n.string("budget.monthly.empty", defaultValue: "No budget data for this month yet"),
                    systemImage: "list.bullet.rectangle.portrait"
                )
            }
        }
        .appBackgroundSink()
        .navigationTitle(Text(L10n.string("budget.monthly", defaultValue: "Monthly Budget")))
        .inlineNavigationBarTitle()
        .navigationDestination(item: $drillTarget) { target in
            StatKindDetailView(
                ledger: target.ledger,
                filter: target.filter,
                window: target.windowOverride ?? AppDates.monthWindow(),
                day: target.day,
                filters: target.filters
            )
        }
    }

    /// Caption label leading, figure trailing. The remainder row carries
    /// FR6's ladder tint (yellow from 80%, red from 100%).
    private func figureRow(_ label: String, value: String, tint: Color?) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer(minLength: 12)
            Text(value)
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(tint ?? Color.primary)
                .lineLimit(1)
        }
    }

    /// The two journal drill rows: trailing figure keeps its inert color
    /// (tap gesture, not a Button), a tertiary chevron marks the push.
    private func drillRow(_ label: String, value: String, isBudgetExcluded: Bool) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer(minLength: 12)
            Text(value)
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(Color.primary)
                .lineLimit(1)
            Image(systemName: "chevron.right")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .contentShape(Rectangle())
        .onTapGesture { drill(isBudgetExcluded: isBudgetExcluded) }
        .accessibilityHint(L10n.string("budget.monthly.drillHint", defaultValue: "View this month's expenses"))
    }

    /// The row's journal set: the month's EXPENSE entries on one side of
    /// the per-entry budget flag — the exact set the tapped figure counts
    /// (unfiltered like every budget drill).
    private func drill(isBudgetExcluded: Bool) {
        guard let ledger = ledgerStore.activeLedger else { return }
        drillTarget = StatDetailTarget(
            ledger: ledger,
            filter: JournalDrillDown(kind: .expense, isBudgetExcluded: isBudgetExcluded),
            day: nil,
            windowOverride: nil,
            filters: nil
        )
    }

    private var statusTint: Color? {
        guard let month else { return nil }
        return BudgetMath.status(countedCents: month.countedCents, budgetCents: month.budgetCents).figureTint
    }

    private var dailyAvailableCents: Int {
        BudgetMath.dailyAvailableCents(
            remainingCents: month?.remainingCents ?? 0,
            daysRemaining: BudgetMath.daysRemaining(inMonthOf: Date())
        )
    }

    private func amount(_ cents: Int) -> String {
        Money.format(Double(cents) / 100, currency: currency)
    }
}
