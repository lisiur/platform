//
//  JournalView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

/// Journal of the active ledger: searchable, paginated entry list with date
/// range and participant filters, plus quick entry and delete.
struct JournalView: View {
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ToastCenter.self) private var toast
    @State private var store = JournalStore()
    @State private var memberStore = MemberStore()
    @State private var entryPendingDelete: JournalEntry?

    private let debouncer = Debouncer()

    var body: some View {
        Group {
            if ledgerStore.isLoading, ledgerStore.ledgers.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let ledger = ledgerStore.activeLedger {
                list(ledger)
            } else {
                EmptyStateView(
                    message: L10n.string("dashboard.selectLedger", defaultValue: "Select a ledger to get started"),
                    systemImage: "book"
                )
            }
        }
        .navigationTitle(Text("Journal"))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                LedgerSwitcherMenu()
            }
            ToolbarItem(placement: .navigation) {
                filterMenu
            }
        }
        .task(id: ledgerStore.activeLedger?.id) {
            guard let id = ledgerStore.activeLedger?.id else { return }
            await store.load(ledgerId: id)
            await memberStore.load(ledgerId: id, myUserId: nil)
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
    }

    @ViewBuilder
    private func list(_ ledger: QianlaiLedger) -> some View {
        List {
            if store.isLoading, store.entries.isEmpty {
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
                EmptyStateView(
                    message: L10n.string("No entries yet", defaultValue: "No entries yet"),
                    systemImage: "doc.text"
                )
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            } else {
                ForEach(store.entries) { entry in
                    EntryRow(entry: entry)
                        .listRowInsets(EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12))
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            if ledger.canPost {
                                Button(role: .destructive) {
                                    entryPendingDelete = entry
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                        }
                        .onAppear {
                            if entry == store.entries.last {
                                Task { await store.loadMore() }
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
        }
        #if os(iOS)
        .searchable(
            text: Binding(
                get: { store.searchQuery },
                set: { newValue in
                    debouncer.run {
                        store.searchQuery = newValue
                    }
                }
            ),
            prompt: Text("Search memos…")
        )
        #else
        .searchable(
            text: Binding(
                get: { store.searchQuery },
                set: { newValue in
                    debouncer.run {
                        store.searchQuery = newValue
                    }
                }
            ),
            placement: .toolbar,
            prompt: Text("Search memos…")
        )
        #endif
        .refreshable {
            await store.reload()
        }
    }

    private var filterMenu: some View {
        Menu {
            Section {
                DatePicker(
                    "From",
                    selection: Binding(
                        get: { store.fromDate ?? Date.distantPast },
                        set: { store.fromDate = $0 == .distantPast ? nil : $0 }
                    ),
                    displayedComponents: .date
                )
                DatePicker(
                    "To",
                    selection: Binding(
                        get: { store.toDate ?? Date.distantPast },
                        set: { store.toDate = $0 == .distantPast ? nil : $0 }
                    ),
                    displayedComponents: .date
                )
            }
            if !memberStore.members.isEmpty {
                Section {
                    Button("All Members") { store.participantMemberId = nil }
                    ForEach(memberStore.members) { member in
                        Button {
                            store.participantMemberId = member.id
                        } label: {
                            if store.participantMemberId == member.id {
                                Label(member.displayName, systemImage: "checkmark")
                            } else {
                                Text(member.displayName)
                            }
                        }
                    }
                }
            }
            if store.hasActiveFilters {
                Section {
                    Button(role: .destructive) {
                        store.clearFilters()
                    } label: {
                        Label("Clear Filters", systemImage: "xmark.circle")
                    }
                }
            }
        } label: {
            Image(systemName: store.hasActiveFilters ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
        }
    }

    private func delete(_ entry: JournalEntry) async {
        do {
            try await store.delete(entry)
            toast.show(L10n.string("journal.deleteSuccess", defaultValue: "Entry deleted"))
        } catch {
            toast.show(error.localizedDescription)
        }
    }
}

/// Debounces search input so each keystroke doesn't fire a request.
final class Debouncer: @unchecked Sendable {
    private var task: Task<Void, Never>?

    func run(delay: Duration = .milliseconds(350), action: @escaping @MainActor () -> Void) {
        task?.cancel()
        task = Task {
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                action()
            }
        }
    }
}
