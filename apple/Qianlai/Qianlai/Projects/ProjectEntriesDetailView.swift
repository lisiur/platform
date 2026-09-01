//
//  ProjectEntriesDetailView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/1.
//

import SwiftUI

/// What a project's entry drill-down shows.
enum ProjectEntryScope: Hashable {
    /// Statement drill-down: one flow (expense or income), optionally
    /// narrowed to a single category row (nil = the flow total).
    case statement(projectId: String, type: AccountType, category: StatementRow?)
    /// Settlement drill-down: the entries behind one member's paid/share/
    /// balance — created by them or tagged with them, plus untagged entries
    /// while they are a current member (untagged splits run across current
    /// members only).
    case settlement(projectId: String, userId: String, name: String)

    var projectId: String {
        switch self {
        case .statement(let projectId, _, _): projectId
        case .settlement(let projectId, _, _): projectId
        }
    }
}

/// Drill-down for one line of a project's income/expense statement or
/// settlement: the project's entries matching the scope. Reuses the shared
/// entry list with a private, pre-filtered JournalStore — the same surface
/// as the Journal, scoped down to this project by the server.
struct ProjectEntriesDetailView: View {
    @Environment(ProjectStore.self) private var projectStore
    @Environment(ReportStore.self) private var reportStore

    let ledger: QianlaiLedger
    let scope: ProjectEntryScope

    /// Private entry store, injected below so EntryListView and the edit
    /// sheet's QuickEntryView act on this page's filtered list without
    /// clashing with the Journal tab's root store.
    @State private var entryStore = JournalStore()

    private var title: String {
        switch scope {
        case .statement(_, let type, let category):
            if let category { return category.displayName }
            return type == .expense
                ? L10n.string("projects.totalExpense", defaultValue: "Expenses")
                : L10n.string("projects.totalIncome", defaultValue: "Income")
        case .settlement(_, _, let name):
            return name
        }
    }

    private var emptyMessage: String {
        switch scope {
        case .statement(_, _, let category):
            if category != nil {
                return L10n.string(
                    "projects.statement.noCategoryEntries",
                    defaultValue: "No entries in this category yet"
                )
            }
            return L10n.string(
                "projects.statement.noEntries",
                defaultValue: "No entries recorded yet"
            )
        case .settlement:
            return L10n.string(
                "projects.settlement.noEntries",
                defaultValue: "No entries involve this member yet"
            )
        }
    }

    var body: some View {
        EntryListView(
            ledger: ledger,
            emptyMessage: emptyMessage,
            showsPostHint: false
        )
        .environment(entryStore)
        .navigationTitle(Text(title))
        .inlineNavigationBarTitle()
        .task {
            // Filters must be in place before `load` so the first fetch is
            // already scoped; their didSets are no-ops while the store has
            // no ledger yet.
            switch scope {
            case .statement(let projectId, let type, let category):
                entryStore.projectFilterId = projectId
                entryStore.accountType = type.rawValue
                entryStore.accountId = category?.id
            case .settlement(let projectId, let userId, _):
                entryStore.projectFilterId = projectId
                entryStore.memberUserId = userId
            }
            await entryStore.load(ledgerId: ledger.id)
        }
        .refreshable {
            await entryStore.reload()
            await refreshReport()
        }
        // A delete (swipe) or edit (sheet) from this page's rows bumps the
        // journal epoch; refresh the project report so the parent detail
        // view never shows stale totals. Posts made elsewhere (Journal tab)
        // land here too — the same refresh keeps this honest.
        .onChange(of: reportStore.journalEpoch) { _, _ in
            Task { await refreshReport() }
        }
    }

    private func refreshReport() async {
        await projectStore.load(ledgerId: ledger.id)
        await projectStore.loadReport(ledgerId: ledger.id, projectId: scope.projectId)
    }
}
