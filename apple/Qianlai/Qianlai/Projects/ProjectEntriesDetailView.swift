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
    @Environment(BackgroundSettings.self) private var backgroundSettings

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
            amountSection: settlementAmountSection,
            alwaysShowsPayer: true,
            topContent: settlementSummary
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

    /// The scoped member's settlement summary as the list's scrolling
    /// header card: paid/share figures plus the signed balance hero, the
    /// same design as the project page's member rows. Nil on statement
    /// scopes, or until the report carries a row for this member.
    private var settlementSummary: AnyView? {
        guard case .settlement = scope else { return nil }
        guard let report = projectStore.report,
              report.project.id == scope.projectId,
              let userId = settlementUserId,
              let row = report.settlement.first(where: { $0.userId == userId })
        else { return nil }
        return AnyView(
            SettlementSummaryLabel(row: row, ledger: ledger)
                .padding(14)
                .background(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(backgroundSettings.cardSurface)
                )
                .padding(.vertical, 8)
        )
    }

    /// Custom right-hand column per settlement row: the entry's gross
    /// actual spend as the headline, then the member's share and their
    /// 应收/应付 line — paid − share for this entry — so each row
    /// reconciles with the settlement table's share and balance columns.
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
        let balance = (Double(paid) - Double(share)) / 100
        // The gross headline carries the entry's money flow like every
        // journal card: expense negative green, income positive red,
        // transfers unsigned neutral.
        let headline: EntryAmountSection.Headline
        switch categoryType(of: entry) {
        case .expense:
            headline = .init(text: "−\(Money.format(entry.amount, currency: currency))", color: .expense)
        case .income:
            headline = .init(text: "+\(Money.format(entry.amount, currency: currency))", color: .income)
        default:
            headline = .init(text: Money.format(entry.amount, currency: currency), color: .primary)
        }
        // An income share flows TO the member — label and tint say so and
        // the value renders as a bare magnitude; expense shares keep the
        // signed 分摊 with the flow tint.
        let shareCaption: EntryAmountSection.Caption
        if categoryType(of: entry) == .income {
            shareCaption = EntryAmountSection.Caption(
                text: "\(L10n.string("projects.incomeShare", defaultValue: "Income share")) \(Money.format(abs(shareValue), currency: currency))",
                color: shareValue == 0 ? nil : .income
            )
        } else {
            shareCaption = EntryAmountSection.Caption(
                text: "\(L10n.string("projects.share", defaultValue: "Share")) \(Money.format(shareValue, currency: currency))",
                color: captionTone(for: shareValue)
            )
        }
        let balanceCaption: EntryAmountSection.Caption?
        switch balance {
        case ..<0:
            balanceCaption = EntryAmountSection.Caption(
                text: "\(L10n.string("projects.balanceOwes", defaultValue: "Owes")) \(Money.format(abs(balance), currency: currency))",
                color: .expense
            )
        case 0:
            balanceCaption = nil
        default:
            balanceCaption = EntryAmountSection.Caption(
                text: "\(L10n.string("projects.balanceReceives", defaultValue: "Receives")) \(Money.format(balance, currency: currency))",
                color: .income
            )
        }
        return EntryAmountSection(headline: headline, total: shareCaption, paid: balanceCaption)
    }

    /// The entry's category type (expense wins over income); nil for
    /// pocket-to-pocket transfers. Mirrors EntryRow's private helper.
    private func categoryType(of entry: JournalEntry) -> AccountType? {
        entry.lines.first { $0.account.type == .expense }?.account.type
            ?? entry.lines.first { $0.account.type == .income }?.account.type
    }

    /// Semantic tint by money flow: an inflow (negative — an income share)
    /// tints income red, an outflow (positive — an owed expense share)
    /// tints expense green, zero stays the row's secondary.
    private func captionTone(for value: Double) -> Color? {
        if value < 0 { return .income }
        if value > 0 { return .expense }
        return nil
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
/// the payer fronts the value (paidById — not necessarily the creator); the
/// split set — tagged participants (the posting-time membership snapshot;
/// new entries always carry one), else current members (legacy untagged
/// entries only) — owes equal shares with the remainder going to the
/// earliest sorted user ids. Kept in exact step so each row's Paid/Share
/// sums reconcile with the settlement table's totals.
private enum SettlementSplit {
    static func entryContribution(
        entry: JournalEntry,
        userId: String,
        memberUserIds: [String]?
    ) -> (paid: Int, share: Int) {
        let value = entry.valueCents
        let paid = entry.paidById == userId ? value : 0

        let tagged = (entry.participants ?? []).compactMap(\.userId)
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
