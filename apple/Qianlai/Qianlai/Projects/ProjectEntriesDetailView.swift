//
//  ProjectEntriesDetailView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/1.
//

import SwiftUI
import UIKit

/// What a project's entry drill-down shows.
enum ProjectEntryScope: Hashable {
    /// Statement drill-down: one flow (expense or income), optionally
    /// narrowed to a single category row (nil = the flow total).
    case statement(projectId: String, type: AccountType, category: StatementRow?)
    /// Settlement drill-down: the entries behind one member's paid/share/
    /// balance — paid for by them or tagged with them, plus untagged
    /// entries while they are a current member (untagged splits run across
    /// current members only). Entries they merely created are excluded —
    /// creation carries no settlement weight.
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
    @Environment(AuthManager.self) private var auth
    @Environment(ToastCenter.self) private var toast

    let ledger: QianlaiLedger
    let scope: ProjectEntryScope

    /// Private entry store, injected below so EntryListView and the edit
    /// sheet's QuickEntryView act on this page's filtered list without
    /// clashing with the Journal tab's root store.
    @State private var entryStore = JournalStore()
    @State private var shareCard: ShareCardRequest?
    @State private var isPreparingShare = false

    /// Hard cap on the share image. Anything longer than this gets
    /// truncated in the card and noted in the footer — ImageRenderer
    /// caps the pixel dimension a Core Animation layer can produce, and a
    /// full ledger can otherwise push the layer past that limit.
    private static let shareEntriesCap = 200

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

    /// The member settlement drill-down keeps the pushed-page large title
    /// like the top-level surfaces; statement drill-downs (totals and
    /// category rows) stay inline.
    private var titleDisplayMode: NavigationBarItem.TitleDisplayMode {
        if case .settlement = scope { return .large }
        return .inline
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
        .toolbar { settlementToolbar }
        .navigationTitle(Text(title))
        .navigationBarTitleDisplayMode(titleDisplayMode)
        .sheet(item: $shareCard) { request in
            ShareSheet(items: [request.image])
        }
        .overlay {
            if isPreparingShare {
                sharePreparingOverlay
            }
        }
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

    /// Toolbar items: a share button on settlement scopes only, the bare
    /// `square.and.arrow.up` system glyph. Statement drill-downs (totals /
    /// category rows) have no shareable surface, so the toolbar stays empty
    /// there.
    @ToolbarContentBuilder
    private var settlementToolbar: some ToolbarContent {
        if case .settlement = scope {
            ToolbarItem(placement: .primaryAction) {
                Button(action: prepareShare) {
                    if isPreparingShare {
                        ProgressView()
                    } else {
                        Image(systemName: "square.and.arrow.up")
                    }
                }
                .disabled(isPreparingShare)
                .accessibilityLabel(L10n.string(
                    "projects.shareSettlement",
                    defaultValue: "Share settlement"
                ))
            }
        }
    }

    /// Fetches every entry for this scope, renders the share card off
    /// screen, and presents the system share sheet with the resulting PNG.
    /// Failures (no row yet, fetch failure, render failure) toast a single
    /// shared message and stay on the page — there is no retry affordance,
    /// the user just taps the button again.
    /// Page-wide overlay shown while the share is preparing. The toolbar's
    /// inline spinner is too easy to miss when the user is looking at the
    /// list mid-scroll — full-scrim ProgressView is unambiguous. The system
    /// activity sheet dismisses the overlay automatically when it appears;
    /// we also flip `isPreparingShare` off in `prepareShare` before the
    /// sheet, so the overlay never races ahead of the result.
    private var sharePreparingOverlay: some View {
        ZStack {
            Color.groupedCanvas.opacity(0.7)
            VStack(spacing: 12) {
                ProgressView()
                Text(L10n.string(
                    "projects.shareCard.preparing",
                    defaultValue: "Preparing share image…"
                ))
                .font(.subheadline)
                .foregroundStyle(.secondary)
            }
            .padding(24)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.cardSurface)
            )
        }
        .transition(.opacity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(L10n.string(
            "projects.shareCard.preparing",
            defaultValue: "Preparing share image…"
        ))
    }

    private func prepareShare() {
        guard !isPreparingShare else { return }
        isPreparingShare = true
        Task {
            let rendered = await renderShareImage()
            isPreparingShare = false
            guard let rendered else {
                toast.show(L10n.string(
                    "projects.shareCard.failed",
                    defaultValue: "Couldn't generate the share image"
                ))
                return
            }
            shareCard = ShareCardRequest(image: rendered)
        }
    }

    private func renderShareImage() async -> UIImage? {
        guard case .settlement(let projectId, let userId, _) = scope,
              let summaryRow = projectStore.report?.settlement
                .first(where: { $0.userId == userId }),
              let allEntries = await entryStore.fetchAllEntries()
        else { return nil }
        let truncated = Array(allEntries.prefix(Self.shareEntriesCap))
        let projectName = projectStore.projects(for: ledger.id)
            .first(where: { $0.id == projectId })?.name ?? ""
        let avatarImage = await loadAvatar(for: summaryRow.avatar)
        let content = MemberSettlementShareCard(
            projectName: projectName,
            member: summaryRow,
            ledger: ledger,
            entries: truncated,
            memberUserIds: currentMemberUserIds,
            avatarImage: avatarImage,
            totalEntries: allEntries.count,
            generatedAt: Date()
        )
        .tint(AppAccent.stored().color)
        .environment(\.colorScheme, .light)
        .environment(\.locale, AppLanguage.resolvedLocale)
        let renderer = ImageRenderer(content: content)
        renderer.scale = shareRendererScale(entryCount: truncated.count)
        return renderer.uiImage
    }

    /// ImageRenderer snapshots synchronously — AsyncImage never lands. The
    /// member's avatar is fetched ahead of time so the rendered circle is
    /// either the bitmap or the initial-letter fallback, never blank.
    private func loadAvatar(for path: String?) async -> UIImage? {
        guard let url = ProfileStore.absoluteAvatarURL(path, baseURL: auth.apiBaseURL)
        else { return nil }
        var request = URLRequest(url: url)
        request.timeoutInterval = 5
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse, http.statusCode == 200,
              let image = UIImage(data: data)
        else { return nil }
        return image
    }

    private var currentMemberUserIds: [String]? {
        projectStore.projects(for: ledger.id)
            .first { $0.id == scope.projectId }?
            .members
            .map(\.userId)
    }

    private func makeAmountSection(for entry: JournalEntry, userId: String) -> EntryAmountSection {
        SettlementAmountColumn.make(
            for: entry,
            userId: userId,
            memberUserIds: currentMemberUserIds,
            currency: ledger.currency
        )
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

    private func refreshReport() async {
        await projectStore.load(ledgerId: ledger.id, force: true)
        await projectStore.loadReport(ledgerId: ledger.id, projectId: scope.projectId)
    }
}

/// The settlement row's right-hand amount column: the entry's gross
/// actual spend as the headline, then the member's share and their
/// 应收/应付 line — paid − share for this entry — so each row reconciles
/// with the settlement table's share and balance columns. Shared by the
/// settlement page's rows and the member share card so the two never
/// drift apart.
enum SettlementAmountColumn {
    static func make(
        for entry: JournalEntry,
        userId: String,
        memberUserIds: [String]?,
        currency: String?
    ) -> EntryAmountSection {
        let (paid, share) = SettlementSplit.entryContribution(
            entry: entry,
            userId: userId,
            memberUserIds: memberUserIds
        )
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
        let shareCaption = Self.shareCaption(
            cents: share,
            categoryType: categoryType(of: entry),
            currency: currency
        )
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
    static func categoryType(of entry: JournalEntry) -> AccountType? {
        entry.lines.first { $0.account.type == .expense }?.account.type
            ?? entry.lines.first { $0.account.type == .income }?.account.type
    }

    /// The 分摊/分账 caption beneath an amount headline, shared by the
    /// settlement drill-down's rows and the ledger journal's project cards
    /// (whose figure is the ledger members' combined share instead of one
    /// member's): an income share flows TO the member — label and tint say
    /// so and the value renders as a bare magnitude; expense shares keep
    /// the signed 分摊 with the flow tint.
    static func shareCaption(
        cents: Int,
        categoryType: AccountType?,
        currency: String?
    ) -> EntryAmountSection.Caption {
        let shareValue = Double(cents) / 100
        if categoryType == .income {
            return EntryAmountSection.Caption(
                text: "\(L10n.string("projects.incomeShare", defaultValue: "Income share")) \(Money.format(abs(shareValue), currency: currency))",
                color: shareValue == 0 ? nil : .income
            )
        }
        return EntryAmountSection.Caption(
            text: "\(L10n.string("projects.share", defaultValue: "Share")) \(Money.format(shareValue, currency: currency))",
            color: tone(for: shareValue)
        )
    }

    /// Semantic tint by money flow: an inflow (negative — an income share)
    /// tints income red, an outflow (positive — an owed expense share)
    /// tints expense green, zero stays the row's secondary.
    private static func tone(for value: Double) -> Color? {
        if value < 0 { return .income }
        if value > 0 { return .expense }
        return nil
    }
}

/// Client-side mirror of the report's settlement math (project.service.ts):
/// per entry, value = expense portion − income portion in integer cents;
/// the payer fronts the value (paidById — not necessarily the creator); the
/// split set — tagged participants (the posting-time membership snapshot;
/// new entries always carry one), else current members (legacy untagged
/// entries only) — owes equal shares with the remainder going to the
/// earliest sorted user ids. Kept in exact step so each row's Paid/Share
/// sums reconcile with the settlement table's totals. Shared with the
/// member settlement share card, which renders the same per-entry figures.
enum SettlementSplit {
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

/// One rendered share image. `Identifiable` so `.sheet(item:)` knows when
/// to dismiss and present. The image is created off-screen by ImageRenderer
/// and handed straight to the share sheet.
private struct ShareCardRequest: Identifiable {
    let id = UUID()
    let image: UIImage
}

/// Drops ImageRenderer's pixel scale with the entry count: a 20-row card
/// fits comfortably at 3x, but a 200-row card approaches the Core
/// Animation layer's pixel ceiling at 3x and needs to scale down so the
/// final `uiImage` isn't truncated. ImageRendererScale is `typealias
/// ImageRendererScale = CGFloat`.
private func shareRendererScale(entryCount: Int) -> CGFloat {
    if entryCount <= 60 { return 3 }
    if entryCount <= 120 { return 2 }
    return 1.5
}

