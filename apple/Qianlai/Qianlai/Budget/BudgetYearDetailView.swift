//
//  BudgetYearDetailView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/15.
//

import SwiftUI

/// The year-to-date table behind the monthly budget page's 年度累计明细
/// entry (FR9): one row per recorded ended month — 月份 / 预算 / 日常已花 /
/// 差额 — plus the net total. Reads the live report off the shared
/// ReportStore, so edits to history that re-fetch the dashboard update
/// this page too. The title follows the net's sign (超支 / 结余 / 持平).
///
/// Deliberately the monthly numbers alone: the annual category budgets'
/// rows have their own page (`CategoryBudgetDetailView`, 2026-09-24
/// user ruling — one page, one subject).
struct BudgetYearDetailView: View {
    @Environment(ReportStore.self) private var store
    @Environment(\.locale) private var locale

    private var year: BudgetYear? { store.budget?.year }

    var body: some View {
        Group {
            if let year {
                List {
                    Section {
                        headerRow
                        ForEach(year.rows, id: \.month) { row in
                            dataRow(
                                label: AppDates.formatMonthShort(
                                    YearMonth(year: row.year, month: row.month),
                                    locale: locale
                                ),
                                budget: row.budgetCents,
                                spent: row.countedCents,
                                diff: row.diffCents,
                                emphasize: false
                            )
                            .appCardRow()
                        }
                    } header: {
                        Text(L10n.string("budget.yearDetail.months", defaultValue: "Months"))
                    } footer: {
                        Text(L10n.string("budget.yearDetail.footer", defaultValue: "The current month never participates; surpluses cancel overspends."))
                    }
                    Section {
                        dataRow(
                            label: L10n.string("budget.yearDetail.total", defaultValue: "Total"),
                            budget: nil,
                            spent: nil,
                            diff: year.netCents,
                            emphasize: true
                        )
                        .appCardRow()
                    }
                }
            } else {
                EmptyStateView(
                    message: L10n.string("budget.yearDetail.empty", defaultValue: "No budget data for this year yet"),
                    systemImage: "chart.bar"
                )
            }
        }
        .appBackgroundSink()
        .navigationTitle(Text(navigationTitle))
        .inlineNavigationBarTitle()
    }

    private var navigationTitle: String {
        year?.annualStatusLabel
            ?? L10n.string("budget.yearDetail", defaultValue: "Yearly breakdown")
    }

    private var currency: String? { store.budget?.currency }

    private var headerRow: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(L10n.string("budget.yearDetail.month", defaultValue: "Month"))
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
            columnCaption(L10n.string("budget.yearDetail.budget", defaultValue: "Budget"))
            columnCaption(L10n.string("budget.spent", defaultValue: "Spent"))
            columnCaption(L10n.string("budget.yearDetail.diff", defaultValue: "Difference"))
        }
        .appCardRow()
    }

    private func columnCaption(_ label: String) -> some View {
        Text(label)
            .font(.caption)
            .foregroundStyle(.secondary)
            .frame(width: Self.columnWidth, alignment: .trailing)
            .lineLimit(1)
    }

    private func dataRow(
        label: String,
        budget: Int?,
        spent: Int?,
        diff: Int,
        emphasize: Bool
    ) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .font(emphasize ? .subheadline.weight(.semibold) : .subheadline)
                .lineLimit(1)
            Spacer()
            column(Money.format(cents: budget, currency: currency), emphasize: emphasize)
            column(Money.format(cents: spent, currency: currency), emphasize: emphasize)
            column(Money.format(cents: diff, currency: currency), emphasize: emphasize)
        }
    }

    private func column(_ value: String, emphasize: Bool) -> some View {
        Text(value)
            .font(emphasize ? .subheadline.weight(.semibold) : .subheadline.monospacedDigit())
            .lineLimit(1)
            .frame(width: Self.columnWidth, alignment: .trailing)
    }

    private static let columnWidth: CGFloat = 86
}
