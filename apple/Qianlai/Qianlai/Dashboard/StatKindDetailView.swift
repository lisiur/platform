//
//  StatKindDetailView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/18.
//

import SwiftUI

/// One dashboard drill-down's filter shape: an optional kind (expense or
/// income) plus an optional category drill-down (a leaf account, or a
/// top-level parent for a 一级分类 rollup bucket). A nil kind describes the
/// calendar card's day drill — every entry of the day, transfers included.
/// `categoryLabel`, when set, swaps the title to "时间 · 分类" instead of
/// "时间 · 支出/收入". `isBudgetExcluded`, when set, scopes the list to one
/// side of the per-entry budget flag (the budget card's 日常已花 / 不计入日常预算
/// columns — always carried with kind = .expense, the pools being
/// expense-only) and swaps the title to "时间 · 日常已花/不计入日常预算".
struct JournalDrillDown: Hashable {
    var kind: QuickEntryKind?
    var accountId: String?
    var parentAccountId: String?
    var categoryLabel: String?
    var isBudgetExcluded: Bool?

    /// Whether the filter resolves an account axis (leaf or parent) —
    /// the composition card's drill gate: a row that can't scope an
    /// account stays inert rather than opening a month-wide view.
    var scopesAccount: Bool {
        accountId != nil || parentAccountId != nil
    }
}

/// One stats drill-down's push payload — the ledger snapshot captured at
/// tap time (every tap path requires an active ledger, so the drill-down
/// can never mount target-less, and a scope change mid-push keeps
/// operating on the captured snapshot). `day`, when set, drills the
/// calendar card's single day (all kinds); otherwise the filter's
/// kind/category axes drive the window. `id` covers every filter axis the
/// tap can carry so a quick re-tap of the same figure re-pushes cleanly
/// (the item's identity flips). Shared by every stats host — the
/// dashboard and the journal's chart page.
struct StatDetailTarget: Identifiable, Hashable {
    let ledger: QianlaiLedger
    let filter: JournalDrillDown
    let day: Date?
    /// Overrides the host's window for this drill — the category budget
    /// card's rows drill the YEAR, not the host's selected month. nil
    /// keeps the host's window.
    var windowOverride: MonthWindow? = nil
    /// The host surface's structural filters, captured at tap time — the
    /// drill's rows (and their day headers) must reconcile with the
    /// filtered figures the user tapped. nil = an unfiltered surface
    /// (the budget cards' drills: their figures are ledger-wide).
    var filters: StatsFilters? = nil

    var id: String {
        let dayKey = day.map { String($0.timeIntervalSince1970) } ?? "-"
        let kindKey = filter.kind?.rawValue ?? "all"
        let budgetKey = filter.isBudgetExcluded.map { $0 ? "excl" : "counted" } ?? "-"
        // The override rides the identity: a year drill and a month drill
        // of the same category are different items, so a quick re-tap of
        // the other one re-pushes cleanly.
        let windowKey = windowOverride.map { "\($0.from.timeIntervalSince1970)-\($0.to.timeIntervalSince1970)" } ?? "-"
        let filterKey = filters.flatMap(StatsFilters.keySegment) ?? "-"
        return "\(ledger.id)|\(dayKey)|\(kindKey)|\(budgetKey)|\(filter.accountId ?? "")|\(filter.parentAccountId ?? "")|\(filter.categoryLabel ?? "")|\(windowKey)|\(filterKey)"
    }
}

/// The stats drill-down PAGE — the journal of the summarized window,
/// filtered to one of the stat card's surfaces:
/// - the stat card's expense hero / income column (no category scope)
/// - the composition card's leaf rows (a single `accountId`)
/// - the composition card's top-level rollup rows (a single `parentAccountId`)
/// - the calendar card's day cells and the trend card's readout bubble
///   (`day` set): that LOCAL day alone, all kinds or the caller's kind,
///   instead of the window
/// Reuses the journal page's shared entry list (EntryListView) with a
/// private store pre-filtered to the window and filter — the rows
/// carry the journal page's day headers, pagination, and swipe
/// edit/delete. Swipe actions bump the shared report epoch so the cards
/// behind re-summarize live.
///
/// The content area carries the journal filter surface on the private
/// store — the funnel sheet and the amount-order menu narrow the drill's
/// set further, the journal page's arrangement — and the toolbar carries
/// the chart entry: the stats component pushed on this page's live
/// window and filters, drill axes included, so a chart page opened from
/// a category drill stays category-scoped. Drill → chart → drill can
/// chain indefinitely, each level narrowing the set; the one brake is
/// the chart entry's empty gate (a page whose set came back empty hides
/// the entry).
///
/// Mounted as a stack PUSH, never a sheet: an iOS 26 presentation quirk
/// remounts a fullScreenCover's content whenever another sheet presents on
/// top of it while a searchable sheet sits anywhere below in the
/// presentation stack — from the old sheet mounting, every quick-entry
/// sub-picker (account/more/date) closed itself ~1s after opening and the
/// cover's whole state reset (the category grid blanked and reloaded) on
/// every presentation edge. A push adds no UIKit presentation host, so the
/// edit-cover-on-this-page shape is the battle-tested journal-tab chain.
struct StatKindDetailView: View {
    @Environment(\.locale) private var locale
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ProjectStore.self) private var projectStore

    let ledger: QianlaiLedger
    let filter: JournalDrillDown
    /// The window the tapped card summarizes — the page's fixed window
    /// (also the fallback context when only `day` drills). Any local
    /// range: the dashboard passes the selected month, a future journal
    /// stats page passes its week/range.
    let window: MonthWindow
    /// When set, the page windows to this single LOCAL day instead of the
    /// month; `filter.kind` still scopes within the day when set (the
    /// calendar drills all kinds, the trend card drills its metric).
    var day: Date? = nil
    /// The host surface's captured structural filters, seeded onto the
    /// private store so the drill's rows (and their day headers)
    /// reconcile with the filtered figures the user tapped. nil on the
    /// unfiltered surfaces — the budget cards' drills above all (their
    /// figures are ledger-wide, and the budget endpoints carry no
    /// filters).
    var filters: StatsFilters? = nil

    /// Private entry store, injected below so the rows act on this
    /// list without clashing with the Journal tab's root store. Configured
    /// before `load` so the first fetch is already windowed and filtered —
    /// the same pattern as the project drill-downs.
    @State private var store = JournalStore()
    /// The member roster behind the funnel sheet's participant picker —
    /// host-owned, the journal page's rule (the sheet reads whatever
    /// store the host already keeps loaded for its own lifetime).
    @State private var memberStore = MemberStore()
    /// One-time payload-seeding guard. `.task` reruns on pop-back from a
    /// deeper push, and this page now carries a funnel — re-seeding then
    /// would revert the picks the user made ON THIS PAGE before drilling
    /// further. The store is aimed exactly once at push; afterwards the
    /// task is a no-op (`load` would early-return on the same ledger
    /// anyway) and the list keeps its rows, filters, and scroll position.
    @State private var didSeedPayload = false
    /// The chart page's push payload, captured at tap time — the window
    /// and the filters (funnel picks AND the drill's own account axes,
    /// via `store.statsFilters`) as they stand when the user taps. nil =
    /// chart page popped.
    @State private var statsTarget: StatsTarget?

    var body: some View {
        EntryListView(
            ledger: ledger,
            emptyMessage: L10n.string("journal.empty", defaultValue: "No entries yet"),
            // A stats drill-down, like the statement pages: no posting
            // footnote; posters keep the swipe actions.
            showsPostHint: false,
            // The journal filter surface, in the content area like the
            // journal page and the dashboard month header: the funnel
            // sheet and the amount-order menu narrow the already-scoped
            // set (the drill's kind/category axes are the baseline the
            // sheet's picks compose with).
            topContent: AnyView(filterSortControls),
            // Ledger-wide surface: project entries carry the ledger
            // members' combined share, like the journal list.
            showsShareCaption: true
        )
        .environment(store)
        // Pull-to-refresh is back: the drop was a sheet-mount accommodation
        // (the refresh control swallowed the sheet's top pull-to-dismiss),
        // and the push has no such gesture to protect — same shape as the
        // pushed statement pages.
        .refreshable {
            await store.reload()
        }
        // The chart entry alone lives in the toolbar — the filter surface
        // sits in the content area above the list (Lisiur's ruling: same
        // arrangement as the journal page and the dashboard, not toolbar
        // chrome).
        .toolbar {
            #if os(iOS)
            ToolbarItem(placement: .topBarTrailing) {
                statsButton
            }
            #else
            ToolbarItem(placement: .primaryAction) {
                statsButton
            }
            #endif
        }
        // The chart page: the stats component for THIS page's window and
        // its live filters, captured at tap. The registration lives on
        // the page (never inside a lazy container, per the
        // navigationDestination contract); the button only raises the
        // payload.
        .navigationDestination(item: $statsTarget) { target in
            JournalStatsView(
                ledger: target.ledger,
                window: target.window,
                filters: target.filters
            )
        }
        // The title must live INSIDE the enclosing NavigationStack's pushed
        // content — attached outside it, the navigation bar never collects
        // it. No searchable here: the field's system glass background only
        // engages after the push transition, flashing a bare field for the
        // first frames, and a one-page keyword filter wasn't worth it.
        .navigationTitle(Text(title))
        .inlineNavigationBarTitle()
        .task {
            guard !didSeedPayload else { return }
            didSeedPayload = true
            if let day {
                // One LOCAL day, midnight through end-of-day.
                let start = Calendar.current.startOfDay(for: day)
                store.setWindow(MonthWindow(from: start, to: AppDates.localEndOfDay(start)))
            } else {
                store.setWindow(window)
            }
            applyPayloadAxes()
            await store.load(ledgerId: ledger.id)
            await memberStore.load(ledgerId: ledger.id, myUserId: nil)
        }
    }

    /// The content-area control row (the journal page's control row minus
    /// the window controls — this page's window is pinned by the push):
    /// the funnel button (the shared component, sheet included) and the
    /// amount-order menu on the trailing edge, the journal page's spacing.
    /// The funnel's Clear restores the payload's axes — the parent
    /// surface's filter state IS the page's baseline, and the window (no
    /// controls here) can never be cleared away.
    private var filterSortControls: some View {
        HStack(spacing: 8) {
            Spacer(minLength: 8)
            JournalFilterButton(
                store: store,
                ledgerStore: ledgerStore,
                projectStore: projectStore,
                memberStore: memberStore,
                clearAction: { applyPayloadAxes() }
            )
            JournalSortMenu(store: store)
                .buttonStyle(.borderless)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 8)
    }

    /// The chart-page button (toolbar, trailing): opens the stats
    /// component on this page's live window and filters — the capture
    /// carries the drill's own account axes (`store.statsFilters`), so
    /// the chart page stays scoped to the category and its donut buckets
    /// that category's children. Same guest gate as every stats entry
    /// (the report endpoints 403 them), plus the depth limiter: a page
    /// whose inherited set came back EMPTY has no chart to show, so its
    /// entry hides — the one brake on otherwise unbounded
    /// drill→chart→drill pushes.
    @ViewBuilder
    private var statsButton: some View {
        if showsStatsButton {
            StatsEntryButton {
                // The capture carries this page's category label so the
                // chart page's NEXT drill (a trend-card day tap, which
                // carries no axes of its own) inherits the category and
                // still titles itself — the store knows ids only. An
                // account-scoped page always captures non-nil (its own
                // axes ride the store); the fallback covers the shape.
                statsTarget = StatsTarget(
                    ledger: ledger,
                    window: MonthWindow(
                        from: store.fromDate ?? window.from,
                        to: store.toDate ?? window.to
                    ),
                    filters: (store.statsFilters ?? StatsFilters())
                        .withCategoryLabel(categoryLabel)
                )
            }
        }
    }

    /// The chart entry's visibility gate. A load in flight is not an
    /// empty set — the gate only closes on a CONFIRMED-empty first page.
    private var showsStatsButton: Bool {
        guard !ledger.isGuest else { return false }
        if store.hasLoadedOnce, store.entries.isEmpty { return false }
        return true
    }

    /// Seeds the store's filter axes from the push payload — the page's
    /// opening state, and (via the funnel's Clear) its restore point.
    /// The drill's own axes win over the host capture, per axis; a drill
    /// that carries no account axes of its own (the trend card's day
    /// tap, the stat card's kind drill) inherits the capture's axes, so
    /// a chart page opened FROM a category drill keeps the category
    /// scoped through every further drill.
    private func applyPayloadAxes() {
        store.kind = filter.kind ?? filters?.kind
        store.accountId = filter.accountId ?? filters?.accountId
        store.parentAccountId = filter.parentAccountId ?? filters?.parentAccountId
        store.budgetExcluded = filter.isBudgetExcluded ?? filters?.budgetExcluded
        store.notCountedOnly = filters?.notCountedOnly == true
        store.participantUserId = filters?.participantUserId
        store.projectFilterId = filters?.projectId
    }

    /// The category label this page is scoped to — its own drill's when
    /// it carries one, else the inherited capture's (a day drill from a
    /// category-scoped chart page carries axes only through `filters`,
    /// label included; see `StatsFilters.categoryLabel`). No funnel UI
    /// writes the account axes, so the payload stays their only source.
    private var categoryLabel: String? {
        filter.categoryLabel ?? filters?.categoryLabel
    }

    /// The axes the funnel sheet can change live (the 类型 picker, the
    /// 只看不计预算 toggle) read from the store once seeded, so the title
    /// describes the list as it re-scopes — the review's nit: a kind
    /// drill flipping 支出→收入 must not keep titling 支出. Before
    /// seeding (the frames before `.task` runs) the payload is the only
    /// source, and it names exactly what the seed will write, so the
    /// title never flickers.
    private var displayKind: QuickEntryKind? {
        didSeedPayload ? store.kind : (filter.kind ?? filters?.kind)
    }

    private var displayBudgetExcluded: Bool? {
        didSeedPayload ? store.budgetExcluded : (filter.isBudgetExcluded ?? filters?.budgetExcluded)
    }

    /// "Sep 2026 · Expense" / "Sep 2026 · 餐饮" — the summarized window
    /// plus the category (own or inherited), the budget column's label,
    /// or the kind; the category label is carried by the filter (or
    /// inherited through the filters capture), so the page never looks
    /// it up by id. The budget card's drills title with the tapped
    /// column's label ("日常已花" / "不计入日常预算"), same rule. Day
    /// drills replace the head with the full date ("2026年9月21日" /
    /// "Sep 21, 2026"), the same medium date the journal's day headers
    /// render, plus the category or the kind when the drill scopes one
    /// (the calendar's all-kinds drill shows the date alone). A
    /// single-month window titles as that month; any other range falls
    /// back to the week stepper's from–to rendering.
    private var title: String {
        if let day {
            let head = AppDates.formatEntryDay(day, locale: locale)
            if let categoryLabel {
                return "\(head) · \(categoryLabel)"
            }
            if let kind = displayKind {
                return "\(head) · \(kind.label)"
            }
            return head
        }
        let head = AppDates.formatWindowTitle(window, locale: locale)
        if let categoryLabel {
            return "\(head) · \(categoryLabel)"
        }
        if let budgetExcluded = displayBudgetExcluded {
            return "\(head) · \(budgetTitleLabel(excluded: budgetExcluded))"
        }
        if let kind = displayKind {
            return "\(head) · \(kind.label)"
        }
        return head
    }

    /// The budget drill's title label — the budget card column the drill
    /// opened from, so the page titles exactly like the tapped figure.
    private func budgetTitleLabel(excluded: Bool) -> String {
        excluded
            ? L10n.string("budget.excluded", defaultValue: "Excluded")
            : L10n.string("budget.spent", defaultValue: "Spent")
    }
}
