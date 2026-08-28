//
//  DashboardView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

/// Overview of the active ledger: month income/expense cards above the
/// month's entries — the same shared entry list the Journal uses, limited
/// to a month window instead of exposing every filter.
struct DashboardView: View {
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ReportStore.self) private var store
    @State private var isShowingLedgerManagement = false
    /// Month-window entry store; a local instance (injected below) so its
    /// filter window never clashes with the Journal tab's root store.
    @State private var entryStore = JournalStore()

    var body: some View {
        Group {
            if ledgerStore.isLoading, ledgerStore.ledgers.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let ledger = ledgerStore.activeLedger {
                EntryListView(
                    ledger: ledger,
                    emptyMessage: L10n.string(
                        "dashboard.noEntriesThisMonth",
                        defaultValue: "No entries this month yet"
                    ),
                    header: monthCards
                )
            } else {
                VStack(spacing: 12) {
                    EmptyStateView(
                        message: L10n.string("dashboard.selectLedger", defaultValue: "Select a ledger to get started"),
                        systemImage: "book"
                    )
                    Button("Create Ledger") {
                        isShowingLedgerManagement = true
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
        }
        .environment(entryStore)
        .navigationTitle(Text("Dashboard"))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                LedgerSwitcherMenu()
            }
        }
        .task(id: ledgerStore.activeLedger?.id) {
            guard let id = ledgerStore.activeLedger?.id else { return }
            await store.load(ledgerId: id)
            // Writing the window always schedules a reload, so revisits
            // refresh too; the first load goes through load(ledgerId:).
            let window = UTCDates.monthWindow()
            entryStore.fromDate = window.from
            entryStore.toDate = window.to
            await entryStore.load(ledgerId: id)
        }
        .refreshable {
            await store.loadDashboard()
            await entryStore.reload()
        }
        .sheet(isPresented: $isShowingLedgerManagement) {
            NavigationStack {
                LedgersView()
            }
        }
    }

    private var monthCards: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(store.dashboard.map { L10n.string("dashboard.monthOf", defaultValue: "This Month (%lld-%02lld)", $0.month.year, $0.month.month) } ?? "This Month")
                .font(.headline)
            StatCard(
                icon: "arrow.down.right",
                label: "Expense",
                value: store.dashboard?.month.totalExpense,
                tone: .negative
            )
            HStack(spacing: 10) {
                StatCard(
                    icon: "arrow.up.right",
                    label: "Income",
                    value: store.dashboard?.month.totalIncome,
                    tone: .positive
                )
                StatCard(icon: "equal", label: "Net", value: store.dashboard?.month.net)
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.cardSurface))
    }
}
