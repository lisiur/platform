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
    @Environment(\.locale) private var locale
    @State private var isShowingLedgerManagement = false
    /// Month the cards and the entry list summarize; stepped with the
    /// chevrons in the month header, capped at the current month.
    @State private var selectedMonth = YearMonth.current
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
            // Both surfaces follow the selected month; ReportStore remembers
            // it so post-delete refreshes re-summarize the same month.
            store.dashboardMonth = selectedMonth
            await store.load(ledgerId: id)
            let window = AppDates.monthWindow(containing: selectedMonth.start)
            entryStore.fromDate = window.from
            entryStore.toDate = window.to
            await entryStore.load(ledgerId: id)
        }
        .onChange(of: selectedMonth) { _, month in
            // Window writes schedule the entries reload; dashboardMonth's
            // didSet schedules the dashboard reload.
            store.dashboardMonth = month
            let window = AppDates.monthWindow(containing: month.start)
            entryStore.fromDate = window.from
            entryStore.toDate = window.to
        }
        .refreshable {
            await store.loadDashboard()
            await entryStore.reload()
        }
        // A post/update/delete elsewhere (quick-entry sheet, Journal tab)
        // bumps this; this page's private entry store is invisible to those
        // callers, so it refetches itself here.
        .onChange(of: store.journalEpoch) { _, _ in
            Task { await entryStore.reload() }
        }
        .sheet(isPresented: $isShowingLedgerManagement) {
            NavigationStack {
                LedgersView()
            }
        }
    }

    private var monthCards: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Button {
                    selectedMonth = selectedMonth.previous
                } label: {
                    Image(systemName: "chevron.left")
                }
                // Borderless: with the default style a tap on the List row
                // fires BOTH chevrons, canceling each other out.
                .buttonStyle(.borderless)
                Spacer()
                Text(AppDates.formatMonthTitle(selectedMonth, locale: locale))
                    .font(.headline)
                Spacer()
                Button {
                    selectedMonth = selectedMonth.next
                } label: {
                    Image(systemName: "chevron.right")
                }
                .buttonStyle(.borderless)
                .disabled(selectedMonth >= YearMonth.current)
            }
            StatCard(
                label: "Expense",
                value: store.dashboard?.month.totalExpense,
                currency: ledgerStore.activeLedger?.currency,
                tone: .negative
            )
            HStack(spacing: 10) {
                StatCard(
                    label: "Income",
                    value: store.dashboard?.month.totalIncome,
                    currency: ledgerStore.activeLedger?.currency,
                    tone: .positive
                )
                StatCard(
                    label: "Net",
                    value: store.dashboard?.month.net,
                    currency: ledgerStore.activeLedger?.currency,
                    // Finance convention: negative net green (绿跌),
                    // non-negative red (红涨).
                    tone: (store.dashboard?.month.net ?? 0) < 0 ? .negative : .positive
                )
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.cardSurface))
    }
}
