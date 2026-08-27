//
//  DashboardView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

/// Overview of the active ledger: net-worth cards, month income/expense, and
/// the most recent entries.
struct DashboardView: View {
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ReportStore.self) private var store
    @State private var isShowingLedgerManagement = false

    var body: some View {
        Group {
            if ledgerStore.isLoading, ledgerStore.ledgers.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let ledger = ledgerStore.activeLedger {
                content(ledger)
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
        .navigationTitle(Text("Dashboard"))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                LedgerSwitcherMenu()
            }
        }
        .task(id: ledgerStore.activeLedger?.id) {
            guard let id = ledgerStore.activeLedger?.id else { return }
            await store.load(ledgerId: id)
        }
        .refreshable {
            await store.loadDashboard()
        }
        .sheet(isPresented: $isShowingLedgerManagement) {
            NavigationStack {
                LedgersView()
            }
        }
    }

    @ViewBuilder
    private func content(_ ledger: QianlaiLedger) -> some View {
        ScrollView {
            VStack(spacing: 20) {
                statCards
                monthCards
                recentEntries
            }
            .padding(16)
            .frame(maxWidth: 640)
            .frame(maxWidth: .infinity)
        }
    }

    private var statCards: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                StatCard(
                    icon: "wallet.pass",
                    label: "Net Worth",
                    value: store.dashboard?.netWorth,
                    tone: (store.dashboard?.netWorth ?? 0) < 0 ? .negative : .default
                )
            }
            HStack(spacing: 10) {
                StatCard(icon: "scalemass", label: "Assets", value: store.dashboard?.assets)
                StatCard(icon: "banknote", label: "Liabilities", value: store.dashboard?.liabilities)
            }
        }
    }

    private var monthCards: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(store.dashboard.map { L10n.string("dashboard.monthOf", defaultValue: "This Month (%lld-%02lld)", $0.month.year, $0.month.month) } ?? "This Month")
                .font(.headline)
            HStack(spacing: 10) {
                StatCard(
                    icon: "arrow.up.right",
                    label: "Income (this month)",
                    value: store.dashboard?.month.totalIncome,
                    tone: .positive
                )
                StatCard(
                    icon: "arrow.down.right",
                    label: "Expense (this month)",
                    value: store.dashboard?.month.totalExpense,
                    tone: .negative
                )
            }
            StatCard(icon: "equal", label: "Net (this month)", value: store.dashboard?.month.net)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(.quaternary.opacity(0.4)))
    }

    @ViewBuilder
    private var recentEntries: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Recent Entries")
                .font(.headline)
                .padding(.bottom, 10)
            if store.isLoadingDashboard, store.dashboard == nil {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .padding(.vertical, 24)
            } else if let entries = store.dashboard?.recentEntries, !entries.isEmpty {
                VStack(spacing: 0) {
                    ForEach(entries) { entry in
                        EntryRow(entry: entry)
                    }
                }
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.quaternary.opacity(0.35)))
            } else {
                EmptyStateView(
                    message: L10n.string("dashboard.noRecentEntries", defaultValue: "No entries yet. Post your first entry in the journal."),
                    systemImage: "doc.text.magnifyingglass"
                )
            }
        }
    }
}

/// One journal entry row: #no, UTC date, memo or account names, participants,
/// creator, amount. Shared by the dashboard and journal list.
struct EntryRow: View {
    let entry: JournalEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("#\(entry.entryNo)")
                    .font(.caption.weight(.medium).monospacedDigit())
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(Color.primary.opacity(0.06)))
                Text(UTCDates.formatEntryDate(entry.date))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Text(Money.format(entry.amount))
                    .font(.callout.weight(.semibold).monospacedDigit())
            }
            if let memo = entry.memo, !memo.isEmpty {
                Text(memo)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(2)
            }
            ForEach(entry.lines) { line in
                HStack(spacing: 6) {
                    Text(line.account.displayName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text(line.debit > 0 ? "+\(Money.format(line.debit))" : "−\(Money.format(line.credit))")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(line.debit > 0 ? Color.income : Color.expense)
                }
            }
            HStack(spacing: 6) {
                if let participants = entry.participants, !participants.isEmpty {
                    Image(systemName: "person.2")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                    ForEach(participants) { participant in
                        BadgeView(
                            text: participant.user?.name ?? participant.ledgerMemberId,
                            outlined: true
                        )
                    }
                    Spacer()
                } else {
                    Spacer()
                }
                if let creator = entry.createdBy {
                    Text(creator.name)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }
}
