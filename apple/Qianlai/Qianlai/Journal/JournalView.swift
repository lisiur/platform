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
    @Environment(JournalStore.self) private var store
    @State private var memberStore = MemberStore()
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
                EntryListView(ledger: ledger, emptyMessage: L10n.string("No entries yet", defaultValue: "No entries yet"))
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
