//
//  ReportsView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

/// Ledger reports: trial balance, income statement, member turnover, with an
/// optional date window.
struct ReportsView: View {
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ReportStore.self) private var store
    @State private var tab: ReportTab = .trialBalance

    enum ReportTab: String, CaseIterable, Identifiable {
        case trialBalance
        case incomeStatement
        case memberTurnover

        var id: String { rawValue }

        var label: String {
            switch self {
            case .trialBalance: L10n.string("reports.trialBalance", defaultValue: "Trial Balance")
            case .incomeStatement: L10n.string("reports.incomeStatement", defaultValue: "Income Statement")
            case .memberTurnover: L10n.string("reports.memberTurnover", defaultValue: "Member Turnover")
            }
        }
    }

    var body: some View {
        Group {
            if ledgerStore.isLoading, ledgerStore.ledgers.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if ledgerStore.activeLedger != nil {
                content
            } else {
                EmptyStateView(
                    message: L10n.string("dashboard.selectLedger", defaultValue: "Select a ledger to get started"),
                    systemImage: "book"
                )
            }
        }
        .navigationTitle(Text("Reports"))
        .toolbar {
            ToolbarItem(placement: .navigation) {
                dateFilterButton
            }
        }
        .task(id: ledgerStore.activeLedger?.id) {
            guard let id = ledgerStore.activeLedger?.id else { return }
            await store.load(ledgerId: id)
        }
    }

    private var dateFilterButton: some View {
        FilterSheetButton(
            fromDate: Binding(
                get: { store.fromDate },
                set: { store.fromDate = $0 }
            ),
            toDate: Binding(
                get: { store.toDate },
                set: { store.toDate = $0 }
            ),
            isActive: store.fromDate != nil || store.toDate != nil,
            icon: "calendar"
        ) {}
    }

    private var content: some View {
        List {
            Section {
                Picker("Report", selection: $tab) {
                    ForEach(ReportTab.allCases) { tab in
                        Text(tab.label).tag(tab)
                    }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 4, trailing: 12))
            }

            switch tab {
            case .trialBalance: trialBalanceSection
            case .incomeStatement: incomeStatementSection
            case .memberTurnover: memberTurnoverSection
            }
        }
        .refreshable {
            await store.reloadWindowed()
        }
    }

    @ViewBuilder
    private var trialBalanceSection: some View {
        if store.isLoadingTrialBalance, store.trialBalance == nil {
            loadingRow
        } else if let trial = store.trialBalance, !trial.accounts.isEmpty {
            Section {
                ForEach(trial.accounts) { row in
                    HStack {
                        Text(row.displayName)
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("Dr \(Money.format(row.totalDebit))")
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(.secondary)
                            Text("Cr \(Money.format(row.totalCredit))")
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                        Text(Money.format(row.balance))
                            .font(.callout.weight(.medium).monospacedDigit())
                            .frame(minWidth: 90, alignment: .trailing)
                    }
                }
                HStack {
                    Text("Totals")
                        .font(.body.weight(.semibold))
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("Dr \(Money.format(trial.totals.debit))")
                            .font(.caption.monospacedDigit())
                        Text("Cr \(Money.format(trial.totals.credit))")
                            .font(.caption.monospacedDigit())
                    }
                }
                .foregroundStyle(.secondary)
            } header: {
                Text("Trial Balance")
            }
        } else {
            emptyRow(L10n.string("reports.empty", defaultValue: "No data for this period"))
        }
    }

    @ViewBuilder
    private var incomeStatementSection: some View {
        if store.isLoadingStatement, store.incomeStatement == nil {
            loadingRow
        } else if let statement = store.incomeStatement,
                  !statement.income.isEmpty || !statement.expense.isEmpty {
            Section("Income") {
                ForEach(statement.income) { row in
                    statementRow(row)
                }
                totalRow(
                    label: L10n.string("reports.totalIncome", defaultValue: "Total Income"),
                    value: statement.totalIncome
                )
            }
            Section("Expense") {
                ForEach(statement.expense) { row in
                    statementRow(row)
                }
                totalRow(
                    label: L10n.string("reports.totalExpense", defaultValue: "Total Expense"),
                    value: statement.totalExpense
                )
            }
            Section {
                HStack {
                    Text("Net")
                        .font(.body.weight(.semibold))
                    Spacer()
                    Text(Money.format(statement.net))
                        .font(.body.weight(.bold).monospacedDigit())
                        .foregroundStyle(statement.net >= 0 ? Color.income : Color.expense)
                }
            }
        } else {
            emptyRow(L10n.string("reports.empty", defaultValue: "No data for this period"))
        }
    }

    @ViewBuilder
    private var memberTurnoverSection: some View {
        if store.isLoadingTurnover, store.memberTurnover == nil {
            loadingRow
        } else if let turnover = store.memberTurnover, !turnover.members.isEmpty {
            Section {
                ForEach(turnover.members) { row in
                    HStack(spacing: 10) {
                        Text(row.name)
                            .font(.body.weight(.medium))
                        BadgeView(text: row.role.label, outlined: true)
                        Spacer()
                        Text("\(row.entryCount)")
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)
                        Text(Money.format(row.turnover))
                            .font(.callout.weight(.medium).monospacedDigit())
                            .frame(minWidth: 90, alignment: .trailing)
                    }
                }
                HStack {
                    Text("Totals")
                        .font(.body.weight(.semibold))
                    Spacer()
                    Text("\(turnover.totals.entries)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                    Text(Money.format(turnover.totals.turnover))
                        .font(.callout.weight(.semibold).monospacedDigit())
                        .frame(minWidth: 90, alignment: .trailing)
                }
                .foregroundStyle(.secondary)
            } header: {
                Text("Member Turnover")
            }
        } else {
            emptyRow(L10n.string("reports.empty", defaultValue: "No data for this period"))
        }
    }

    private func statementRow(_ row: StatementRow) -> some View {
        HStack {
            Text(row.displayName)
            Spacer()
            Text(Money.format(row.balance))
                .font(.callout.monospacedDigit())
        }
    }

    private func totalRow(label: String, value: Double) -> some View {
        HStack {
            Text(label)
                .font(.body.weight(.semibold))
            Spacer()
            Text(Money.format(value))
                .font(.body.weight(.semibold).monospacedDigit())
        }
        .foregroundStyle(.secondary)
    }

    private var loadingRow: some View {
        HStack {
            Spacer()
            ProgressView()
            Spacer()
        }
        .listRowSeparator(.hidden)
        .padding(.vertical, 40)
    }

    private func emptyRow(_ message: String) -> some View {
        EmptyStateView(message: message, systemImage: "chart.bar")
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
    }
}
