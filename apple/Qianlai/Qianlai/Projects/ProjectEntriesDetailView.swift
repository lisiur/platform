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
            showsPostHint: false,
            amountSection: settlementAmountSection
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
        await projectStore.load(ledgerId: ledger.id, force: true)
        await projectStore.loadReport(ledgerId: ledger.id, projectId: scope.projectId)
    }

    private var settlementUserId: String? {
        if case .settlement(_, let userId, _) = scope { return userId }
        return nil
    }

    /// Custom right-hand column per settlement row: the member's share as
    /// the main amount, the entry total, and their 垫付 (fronted) line — so
    /// each row reconciles with the settlement table's paid/share columns.
    private var settlementAmountSection: ((JournalEntry) -> EntryAmountSection?)? {
        guard let userId = settlementUserId else { return nil }
        return { [self] entry in makeAmountSection(for: entry, userId: userId) }
    }

    private func makeAmountSection(for entry: JournalEntry, userId: String) -> EntryAmountSection {
        let (paid, share) = SettlementSplit.entryContribution(
            entry: entry,
            userId: userId,
            memberUserIds: currentMemberUserIds
        )
        let currency = ledger.currency
        let shareValue = Double(share) / 100
        let headline: EntryAmountSection.Headline
        switch shareValue {
        case ..<0:
            headline = .init(text: "+\(Money.format(abs(shareValue), currency: currency))", color: .income)
        case 0:
            headline = .init(text: Money.format(0, currency: currency), color: .primary)
        default:
            headline = .init(text: "−\(Money.format(shareValue, currency: currency))", color: .expense)
        }
        let totalLabel = L10n.string("journal.totalAmount", defaultValue: "Total")
        let paidLabel = L10n.string("projects.paid", defaultValue: "Paid")
        return EntryAmountSection(
            headline: headline,
            total: "\(totalLabel) \(Money.format(entry.amount, currency: currency))",
            paid: "\(paidLabel) \(Money.format(Double(paid) / 100, currency: currency))"
        )
    }

    private var currentMemberUserIds: [String]? {
        projectStore.projects(for: ledger.id)
            .first { $0.id == scope.projectId }?
            .members
            .map(\.userId)
    }
}

/// Client-side mirror of the report's settlement math (project.service.ts):
/// per entry, value = expense portion − income portion in integer cents;
/// the creator fronts the value; the split set — tagged participants (the
/// posting-time membership snapshot; new entries always carry one), else
/// current members (legacy untagged entries only) — owes equal shares with
/// the remainder going to the earliest sorted user ids. Kept in exact step
/// so each row's Paid/Share sums reconcile with the settlement table's
/// totals.
private enum SettlementSplit {
    static func entryContribution(
        entry: JournalEntry,
        userId: String,
        memberUserIds: [String]?
    ) -> (paid: Int, share: Int) {
        let value = entry.valueCents
        let paid = entry.createdById == userId ? value : 0

        let tagged = (entry.participants ?? []).compactMap { $0.user?.id }
        let splitUserIds: [String]
        if tagged.isEmpty {
            // Legacy entries only: new project entries are auto-tagged at
            // posting (journal.service withAutoParticipants), so their
            // split set never shifts under membership changes. Untagged
            // entries split across current members at read time; without
            // the member list the share can't be computed honestly, so the
            // share half contributes nothing (the row still shows it as
            // zero).
            guard let memberUserIds else { return (paid, 0) }
            splitUserIds = memberUserIds.sorted()
        } else {
            splitUserIds = Array(Set(tagged)).sorted()
        }
        guard value != 0, let index = splitUserIds.firstIndex(of: userId) else {
            return (paid, 0)
        }
        let n = splitUserIds.count
        let base = JournalEntry.floorDiv(value, n)
        let remainder = value - base * n
        return (paid, base + (index < remainder ? 1 : 0))
    }

    /// Floor division with JS Math.floor semantics — Swift's `/` truncates
    /// toward zero, and negative values (income-heavy entries) must floor
    /// like the server does.
    private static func floorDiv(_ a: Int, _ b: Int) -> Int {
        JournalEntry.floorDiv(a, b)
    }
}
