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
    @Environment(JournalStore.self) private var store
    @Environment(ReportStore.self) private var reportStore
    @State private var memberStore = MemberStore()
    @State private var entryPendingDelete: JournalEntry?
    /// Local text for `.searchable`: bound straight from store via a computed
    /// Binding, any unrelated store write (reload flags, filter commits)
    /// re-renders the search field mid-animation and makes it flash.
    @State private var searchField = ""

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
                filterButton
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
            // Blocking spinner only before anything has ever loaded; later
            // refetches keep the current content (rows or empty state) until
            // the response replaces it atomically — swapping content on every
            // refetch flashed "No entries yet" and bounced the search bar.
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
        .searchable(text: $searchField, prompt: Text("Search memos…"))
        #else
        .searchable(
            text: $searchField,
            placement: .toolbar,
            prompt: Text("Search memos…")
        )
        #endif
        .onChange(of: searchField) { _, newValue in
            debouncer.run {
                store.searchQuery = newValue
            }
        }
        // Keep the local field in step when the store resets it (Clear).
        .onChange(of: store.searchQuery) { _, newValue in
            if newValue != searchField {
                // Cancel any pending debounced write or it would commit the
                // pre-clear text right after this sync.
                debouncer.cancel()
                searchField = newValue
            }
        }
        .refreshable {
            await store.reload()
        }
    }

    private var filterButton: some View {
        FilterSheetButton(
            fromDate: Binding(
                get: { store.fromDate },
                set: { store.fromDate = $0 }
            ),
            toDate: Binding(
                get: { store.toDate },
                set: { store.toDate = $0 }
            ),
            isActive: store.hasActiveFilters,
            icon: "line.3.horizontal.decrease.circle",
            onClear: { store.clearFilters() }
        ) {
            if !memberStore.members.isEmpty {
                Section {
                    Picker(
                        "Participant",
                        selection: Binding(
                            get: { store.participantMemberId ?? "" },
                            set: { store.participantMemberId = $0.isEmpty ? nil : $0 }
                        )
                    ) {
                        Text("All Members").tag("")
                        ForEach(memberStore.members) { member in
                            Text(member.displayName).tag(member.id)
                        }
                    }
                }
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

    func cancel() {
        task?.cancel()
        task = nil
    }
}
