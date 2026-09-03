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
    /// The app-level project store that owns the ledger switcher's scope —
    /// the local `projectStore` below only feeds the filter sheet's picker.
    @Environment(ProjectStore.self) private var appProjectStore
    @State private var memberStore = MemberStore()
    @State private var projectStore = ProjectStore()
    /// Always-visible search field pinned above the list. Deliberately not
    /// `.searchable`: the system search bar is glass chrome that re-lays-out
    /// at the pull-to-refresh boundary on iOS 26 and visibly flashes, and it
    /// offers no "always visible" behavior to pin it down. A plain field has
    /// no chrome to animate.
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
                .frame(maxWidth: .infinity, maxHeight: .infinity)
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
            syncScopeFilter()
            await store.load(ledgerId: id)
            await memberStore.load(ledgerId: id, myUserId: nil)
            await projectStore.load(ledgerId: id)
        }
        // The scope can change while this tab stays alive (switcher on the
        // dashboard, ledger switcher inside the quick-entry sheet) or fill
        // in late as the project cache loads — follow it immediately.
        .onChange(of: scopedProject?.id) {
            syncScopeFilter()
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            searchBar
        }
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

    /// The always-visible search field. Liquid Glass like the system search
    /// bar it replaces, but pinned as page content — no search chrome, so
    /// nothing re-lays-out or flashes at the pull-to-refresh boundary.
    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField("Search memos…", text: $searchField)
            if !searchField.isEmpty {
                Button {
                    searchField = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .glassEffect(in: .capsule)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
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
            if !projectStore.projects.isEmpty {
                Section {
                    Picker(
                        "Project",
                        selection: Binding(
                            get: { store.projectFilterId ?? "" },
                            set: { store.projectFilterId = $0.isEmpty ? nil : $0 }
                        )
                    ) {
                        Text("All Projects").tag("")
                        ForEach(projectStore.projects) { project in
                            Text(project.name).tag(project.id)
                        }
                    }
                    // The switcher's scope owns the project while one is
                    // active — the picker stays visible so the scope is
                    // discoverable, but can't be changed here.
                    .disabled(scopedProject != nil)
                } footer: {
                    if scopedProject != nil {
                        Text(L10n.string(
                            "journal.project.scopeFooter",
                            defaultValue: "The journal is scoped to this project. Change the project from the ledger switcher."
                        ))
                    }
                }
            }
            // Ledger-wide scope only: a project filter always shows every
            // entry of that project, so the flag choice would be a no-op.
            if store.projectFilterId == nil {
                Section {
                    Picker(
                        "Show",
                        selection: Binding(
                            get: { store.includeExcluded ? "all" : "counted" },
                            set: { store.includeExcluded = $0 == "all" }
                        )
                    ) {
                        Text(L10n.string("journal.show.counted", defaultValue: "Counted in Income & Expense")).tag("counted")
                        Text(L10n.string("journal.show.all", defaultValue: "All Entries")).tag("all")
                    }
                } footer: {
                    Text(L10n.string(
                        "journal.show.footer",
                        defaultValue: "Guest posts and opted-out entries (e.g. credit-card repayments) don't count toward the ledger's income & expense totals."
                    ))
                }
            }
            if !participantCandidates.isEmpty {
                Section {
                    Picker(
                        "Participant",
                        selection: Binding(
                            get: { store.participantMemberId ?? "" },
                            set: { store.participantMemberId = $0.isEmpty ? nil : $0 }
                        )
                    ) {
                        Text("All Members").tag("")
                        ForEach(participantCandidates) { member in
                            Text(member.displayName).tag(member.id)
                        }
                    }
                }
            }
        }
    }

    /// Participant filter options, scoped to the active project filter when
    /// one is set — a project's entries can only be tagged with that
    /// project's members, so offering the whole ledger roster would just
    /// yield empty results. Falls back to the full ledger roster otherwise.
    private var participantCandidates: [LedgerMember] {
        if let projectId = store.projectFilterId,
           let project = projectStore.projects.first(where: { $0.id == projectId }) {
            let memberUserIds = Set(project.members.map(\.userId))
            return memberStore.members.filter { memberUserIds.contains($0.userId) }
        }
        return memberStore.members
    }

    /// The project currently claiming scope in the ledger switcher — an
    /// explicit selection for any role, the auto-picked first project for
    /// guests. A non-nil scope limits the journal to that project's
    /// entries; unassigned entries only surface ledger-wide.
    private var scopedProject: QianlaiProject? {
        guard let ledger = ledgerStore.activeLedger else { return nil }
        return appProjectStore.scopedProject(in: ledger.id, isGuestLedger: ledger.isGuest)
    }

    /// Forces the store's project filter onto the switcher's scope. Runs
    /// before `store.load` so a ledger switch's first fetch is already
    /// scoped, and again from `.onChange(of: scopedProject?.id)` — which
    /// fires even while this tab is offscreen — on live scope changes; a
    /// nil scope lifts the filter. Also records the scope so the filter
    /// sheet can't change it and Clear restores it.
    private func syncScopeFilter() {
        let scopedId = scopedProject?.id
        if store.scopeProjectId != scopedId { store.scopeProjectId = scopedId }
        if store.projectFilterId != scopedId {
            store.projectFilterId = scopedId
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
