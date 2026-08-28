//
//  EntryListView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/28.
//

import SwiftUI

/// The shared entry list surface: day-grouped sections (one rounded card
/// per day), swipe-to-delete with confirmation, incremental pagination, and
/// load-state rows. The Journal embeds it with every filter available; the
/// Dashboard mounts it with a month-window JournalStore so its entries
/// carry the same actions.
struct EntryListView<Header: View>: View {
    @Environment(JournalStore.self) private var store
    @Environment(ReportStore.self) private var reportStore
    @Environment(ToastCenter.self) private var toast
    @Environment(\.locale) private var locale

    let ledger: QianlaiLedger
    var emptyMessage: String
    /// Optional row rendered above the entries (Dashboard's month cards).
    var header: Header?

    @State private var entryPendingDelete: JournalEntry?
    @State private var entryPendingEdit: JournalEntry?

    init(ledger: QianlaiLedger, emptyMessage: String, header: Header? = nil) {
        self.ledger = ledger
        self.emptyMessage = emptyMessage
        self.header = header
    }

    var body: some View {
        List {
            if let header {
                header
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    // Zero insets: the row bounds span the same width as
                    // the grouped section cards below, so a custom card
                    // here lines up with the day cards on every device.
                    .listRowInsets(EdgeInsets())
                    .padding(.top, 16)
                    .padding(.bottom, 4)
            }
            // Blocking spinner only before anything has ever loaded; later
            // refetches keep the current content (rows or empty state) until
            // the response replaces it atomically.
            if store.isLoading, store.entries.isEmpty, !store.hasLoadedOnce {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .listRowSeparator(.hidden)
            } else if let error = store.loadError, store.entries.isEmpty {
                ErrorRetryView(message: error) {
                    Task { await store.reload() }
                }
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            } else if store.entries.isEmpty {
                EmptyStateView(message: emptyMessage, systemImage: "doc.text")
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            } else {
                ForEach(store.entries.groupedByDay, id: \.day) { group in
                    // Default grouped style renders each Section as one
                    // rounded card with the date above it — same UI as the
                    // Me page.
                    Section {
                        ForEach(group.entries) { entry in
                            EntryRow(entry: entry)
                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                    if ledger.canPost {
                                        Button(role: .destructive) {
                                            entryPendingDelete = entry
                                        } label: {
                                            Label("Delete", systemImage: "trash")
                                        }
                                        Button {
                                            entryPendingEdit = entry
                                        } label: {
                                            Label("Edit", systemImage: "pencil")
                                        }
                                    }
                                }
                                .onAppear {
                                    if entry == store.entries.last {
                                        Task { await store.loadMore() }
                                    }
                                }
                        }
                    } header: {
                        Text(UTCDates.formatEntryDay(group.day, locale: locale))
                    }
                }
            }
            if store.isLoadingMore {
                HStack {
                    Spacer()
                    ProgressView().controlSize(.small)
                    Spacer()
                }
                .listRowSeparator(.hidden)
            }
            if !ledger.canPost {
                Label(
                    "Editor access or higher is required to post entries.",
                    systemImage: "lock"
                )
                .font(.footnote)
                .foregroundStyle(.secondary)
                .listRowSeparator(.hidden)
            }
        }
        .alert(
            L10n.string("journal.delete", defaultValue: "Delete"),
            isPresented: Binding(
                get: { entryPendingDelete != nil },
                set: { if !$0 { entryPendingDelete = nil } }
            )
        ) {
            Button("Delete", role: .destructive) {
                if let entry = entryPendingDelete {
                    Task { await delete(entry) }
                }
                entryPendingDelete = nil
            }
            Button("Cancel", role: .cancel) { entryPendingDelete = nil }
        } message: {
            if let entry = entryPendingDelete {
                Text("Delete entry #\(entry.entryNo)? Reports will be recalculated.")
            }
        }
        .sheet(item: $entryPendingEdit) { entry in
            NavigationStack {
                QuickEntryView(entry: entry)
            }
        }
    }

    private func delete(_ entry: JournalEntry) async {
        do {
            try await store.delete(entry)
            toast.show(L10n.string("journal.deleteSuccess", defaultValue: "Entry deleted"))
            Task { await reportStore.refreshAfterPosting() }
        } catch {
            toast.show(error.localizedDescription)
        }
    }
}

extension EntryListView where Header == EmptyView {
    /// List without a leading header row (the Journal).
    init(ledger: QianlaiLedger, emptyMessage: String) {
        self.init(ledger: ledger, emptyMessage: emptyMessage, header: nil)
    }
}

/// One journal entry card: category icon + title, HH:mm (the enclosing day
/// group header carries the date), memo, other account names, participants,
/// signed amount. Shared by the dashboard and journal list. Lines
/// posting against the seeded default pocket are hidden, and the amount
/// follows the money flow: expenses negative, income positive.
struct EntryRow: View {
    let entry: JournalEntry

    var body: some View {
        HStack(spacing: 10) {
            categoryBadge
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Spacer()
                    Text(headlineAmount.text)
                        .font(.callout.weight(.semibold).monospacedDigit())
                        .foregroundStyle(headlineAmount.color)
                }
                Text(UTCDates.formatEntryTime(entry.date))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                if let memo = entry.memo, !memo.isEmpty {
                    Text(memo)
                        .font(.caption)
                        .lineLimit(2)
                }
                ForEach(entry.lines.filter { !$0.account.isDefaultPocket && $0 != categoryLine }) { line in
                    Text(line.account.displayName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                if let participants = entry.participants, !participants.isEmpty {
                    HStack(spacing: 6) {
                        Image(systemName: "person.2")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                        ForEach(participants) { participant in
                            BadgeView(
                                text: participant.user?.name ?? participant.ledgerMemberId,
                                outlined: true
                            )
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
    }

    /// The entry's category line (expense wins over income); nil for
    /// pocket-to-pocket transfers.
    private var categoryLine: JournalLine? {
        entry.lines.first { $0.account.type == .expense }
            ?? entry.lines.first { $0.account.type == .income }
    }

    private var title: String {
        categoryLine?.account.displayName
            ?? L10n.string("quick.kind.transfer", defaultValue: "Transfer")
    }

    /// Leading badge showing the category account's emoji; falls back to a
    /// flow symbol when unset, or a transfer symbol without a category line.
    private var categoryBadge: some View {
        Group {
            if let icon = categoryLine?.account.icon, !icon.isEmpty {
                Text(icon)
                    .font(.title3)
            } else {
                Image(systemName: fallbackSymbol)
                    .font(.body.weight(.medium))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: 36, height: 36)
        .background(Circle().fill(Color.primary.opacity(0.06)))
    }

    private var fallbackSymbol: String {
        switch categoryLine?.account.type {
        case .expense: "arrow.down.circle.fill"
        case .income: "arrow.up.circle.fill"
        default: "arrow.left.arrow.right.circle.fill"
        }
    }

    /// The headline amount carries the entry's money flow: an expense
    /// category line makes it negative, an income line positive; transfers
    /// (no category line) stay unsigned.
    private var headlineAmount: (text: String, color: Color) {
        switch categoryLine?.account.type {
        case .expense: ("−\(Money.format(entry.amount))", .expense)
        case .income: ("+\(Money.format(entry.amount))", .income)
        default: (Money.format(entry.amount), .primary)
        }
    }
}
