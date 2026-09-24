//
//  DashboardView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

/// Overview of the active ledger: a scrolling month summary — month
/// header, budget card, the reusable stats component's overview stat
/// block, the today/week/year card — over the selected month's records.
/// The summary rides the shared entry list's topContent row (the same
/// composition the month view page uses); the list below is that
/// selected month's journal. The month header's trailing edge carries
/// the journal page's filter funnel and amount sort (the shared journal
/// filter surface): they move the list and the two actuals cards (stat
/// block, range card) as one state — the budget cards stay ledger-wide
/// (their endpoints carry no filters) — while the window itself stays
/// pinned to the current month (the funnel's Clear keeps the pin;
/// history browsing lives on the month view page).
///
/// When a project is scoped — a guest ledger's auto-picked/selected
/// project, or any role's explicit switcher selection — the dashboard
/// swaps to the project detail page (statement, settlement, members).
/// Project-scoped guests don't see the ledger-wide month summary; the
/// project view is the only surface they have.
struct DashboardView: View {
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ProjectStore.self) private var projectStore
    @Environment(ReportStore.self) private var store
    @Environment(\.locale) private var locale
    @State private var isShowingLedgerForm = false
    @State private var isShowingJoin = false
    @State private var isShowingLedgerManager = false
    /// Push flag for the month view page (the toolbar calendar button) —
    /// registered on the page for the same lazy-container contract.
    @State private var isShowingMonthCalendar = false
    /// Push flag for the monthly budget's page (the overview card's
    /// budget line) — page-owned for the same lazy-container contract.
    @State private var isShowingMonthBudgetDetail = false
    /// Push flag for the annual category budgets' page (the overview
    /// card's trigger line) — page-owned for the same lazy-container
    /// contract.
    @State private var isShowingCategoryDetail = false
    /// The stats component's payloads (overview, daily, categories), one
    /// windowed store for this surface. Caller-owned so the page's
    /// pull-to-refresh reloads the same store the cards read. Seeded at
    /// creation from the snapshot cache (the ledger via the "last" meta
    /// record, this page's own current-month unfiltered window), so the
    /// launch tab's first frame carries last-known figures — the
    /// task-time hydrate below runs a frame or more late and flashed the
    /// placeholders.
    @State private var statsStore = StatsStore(
        seedLastLedger: true, window: AppDates.monthWindow(), filters: nil
    )
    /// The today/week/year card's day list — its own year-wide
    /// daily-summary fetch, independent of the month stepper.
    @State private var rangeStore = RangeTotalsStore()
    /// The selected month's records — a private store so the dashboard's
    /// rows act on this page without clashing with the Journal tab's
    /// root store (the drill-down rule). Windowed to the month header's
    /// selection; guests read it too. The header's funnel and sort
    /// write their picks here, and every surface below reads the same
    /// state back (the list rows, their day headers, the stat block,
    /// the range card).
    @State private var monthEntryStore = JournalStore()
    /// The member roster behind the funnel sheet's participant picker —
    /// host-owned, the journal page's rule (the sheet reads whatever
    /// store the host already keeps loaded for its own lifetime).
    @State private var memberStore = MemberStore()
    /// Target of the dashboard's drill-down — the tapped figure's
    /// filter (kind + optional category drill) plus the ledger snapshot it
    /// drills into. nil = drill-down popped. The payload type is shared
    /// with the journal's chart page (see StatKindDetailView).
    @State private var statDetailTarget: StatDetailTarget?
    /// The chart page's push payload, captured at tap time — the month
    /// window is pinned here, but the funnel's filters keep moving, and
    /// the pushed page must describe the state the user tapped on.
    /// nil = chart page popped. The shared payload type (with the journal
    /// page's and the drill-downs' chart entries) lives beside the page
    /// it pushes.
    @State private var statsTarget: StatsTarget?

    /// The project the dashboard is currently scoped to. Any role can claim
    /// project scope by explicitly selecting a project in the switcher;
    /// guest ledgers additionally auto-pick their first project — guests
    /// default to project scope, full roles default to the ledger-wide view
    /// until they pick a project. Resolved against `projects(for:)`, never
    /// the shared `projects` mirror, so background prefetches of other
    /// ledgers can't surface a foreign project here. While the project is
    /// still loading we render a spinner so the dashboard doesn't briefly
    /// flash the "no longer exists" empty state from ProjectDetailView.
    private var activeProject: QianlaiProject? {
        guard let ledger = ledgerStore.activeLedger else { return nil }
        return projectStore.scopedProject(in: ledger.id, isGuestLedger: ledger.isGuest)
    }

    /// True when the user is in project scope but the project hasn't
    /// finished loading yet (e.g. just tapped a project in the
    /// switcher). Renders a spinner instead of the regular dashboard.
    /// Non-guest roles only enter the loading window with a pending
    /// explicit selection — otherwise a plain ledger load would flash
    /// a spinner instead of the ledger view.
    ///
    /// Resolves through ProjectStore's per-ledger resolved set, not the
    /// transient `isLoading` flag: in the gap between a ledger becoming
    /// active and its project load starting, `isLoading` still reads false,
    /// which used to let this page treat the scope as settled and fire
    /// ledger-wide report fetches (a guaranteed 403 for guests) before the
    /// scope resolved and discarded them.
    private var isProjectScopeLoading: Bool {
        guard let ledger = ledgerStore.activeLedger else { return false }
        guard ledger.isGuest || projectStore.selectedProjectId != nil else { return false }
        return activeProject == nil && !projectStore.isResolved(ledgerId: ledger.id)
    }

    /// True when the project detail view owns the screen (now or once the
    /// loading window resolves) and the ledger-wide dashboard fetches are
    /// skipped.
    private var showsProjectDetail: Bool {
        activeProject != nil || isProjectScopeLoading
    }

    /// The scoped-project mirror's name for `ledgerId` — the project name
    /// the widgets surface for the last scope resolved in that ledger. nil
    /// when the mirror holds another ledger (cleared at logout, missing
    /// App Group, or a ledger context that changed).
    private func mirroredProjectName(inLedgerId ledgerId: String) -> String? {
        guard let mirror = WidgetDataStore.loadScopedProject(), mirror.ledgerId == ledgerId else {
            return nil
        }
        return mirror.name
    }

    /// Large-title name while the scope window is still loading: the
    /// project name from the mirror, so a relaunch that restores a project
    /// selection titles itself with the project before the list fetch
    /// lands, instead of flashing the ledger name for the round-trip. The
    /// mirror is not cleared on this path (the ledger context did not
    /// change), and a stale entry (project deleted while away)
    /// self-corrects when the load clears the selection. nil — no matching
    /// mirror — falls back to the ledger name as before.
    private var loadingScopeName: String? {
        guard isProjectScopeLoading, let ledger = ledgerStore.activeLedger else { return nil }
        return mirroredProjectName(inLedgerId: ledger.id)
    }

    /// Title while the LEDGER list itself is still fetching — the one
    /// window where even `activeLedger` is nil and no live scope name
    /// exists. The mirrors describe the last scope resolved for the
    /// restored ledger context (the scoped project when the last session
    /// ended in project scope, else the active ledger), so the relaunch
    /// titles itself with the name it is about to land on instead of
    /// flashing the generic title for the round-trip. Gated on `!hasLoaded`
    /// rather than the transient `isLoading`: isLoading is still false on
    /// frames between the dashboard mounting and the app-level task
    /// starting the first fetch, and a first frame on the generic title is
    /// exactly the flash this exists to prevent. Once the first load
    /// settles the live chain takes over, and a ledger deleted while away
    /// stops matching its own mirror (the stale name can then only show
    /// for this one window before the live chain corrects it).
    private var restoredScopeName: String? {
        guard !ledgerStore.hasLoaded,
              let restoredId = WidgetDataStore.loadAppActiveLedgerId()
        else { return nil }
        if let projectName = mirroredProjectName(inLedgerId: restoredId) {
            return projectName
        }
        if let ledger = WidgetDataStore.loadActiveLedger(), ledger.id == restoredId {
            return ledger.name
        }
        return nil
    }

    /// Key for the dashboard fetch task: active ledger plus the project
    /// scope state the skip decision depends on. Reacting to the scope
    /// settling matters — the loading-window early return below must be
    /// retried once `ProjectStore.load` finishes without producing a
    /// project (guest with zero projects), or the dashboard would never
    /// fetch stats for that ledger.
    private var dashboardTaskKey: String {
        let ledgerId = ledgerStore.activeLedger?.id ?? "none"
        let projectId = activeProject?.id ?? "none"
        return "\(ledgerId)|\(projectId)|\(isProjectScopeLoading ? "loading" : "settled")"
    }

    var body: some View {
        Group {
            if ledgerStore.isLoading, ledgerStore.ledgers.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let ledger = ledgerStore.activeLedger {
                if let project = activeProject {
                    ProjectDetailView(projectId: project.id, hidesNavigationTitle: true)
                } else if isProjectScopeLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    dashboardSummary(ledger)
                }
            } else {
                VStack(spacing: 28) {
                    EmptyStateView(
                        message: L10n.string("dashboard.selectLedger", defaultValue: "Select a ledger to get started"),
                        systemImage: "text.book.closed"
                    )
                    VStack(spacing: 24) {
                        Button {
                            isShowingLedgerForm = true
                        } label: {
                            Label(
                                L10n.string("ledgers.create", defaultValue: "Create Ledger"),
                                systemImage: "plus"
                            )
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        Button {
                            isShowingJoin = true
                        } label: {
                            Label(L10n.string("dashboard.joinViaQrcode", defaultValue: "Join via qrcode"), systemImage: "qrcode")
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                    }
                }
            }
        }
        // Large title like the assets page's, not the tab-chrome inline
        // style. Names the active scope: the project in project scope
        // (ProjectDetailView sets no title of its own, so this shows
        // through), the mirror's project name while that scope is still
        // loading, the ledger otherwise — and while even the ledger list is
        // still fetching, the last scope the mirrors recorded, so a relaunch
        // never flashes the generic name on its way to the restored scope.
        // The generic title only covers the settled no-ledger empty state.
        .navigationTitle(
            Text(
                activeProject?.name ?? loadingScopeName ?? ledgerStore.activeLedger?.name
                    ?? restoredScopeName
                    ?? L10n.string("dashboard.title", defaultValue: "Ledger")
            )
        )
        .toolbar {
            #if os(iOS)
            ToolbarItem(placement: .topBarLeading) {
                LedgerSwitcherMenu(isShowingManage: $isShowingLedgerManager, iconOnly: true)
            }
            ToolbarItem(placement: .topBarTrailing) {
                calendarStatsGroup
            }
            #else
            ToolbarItem(placement: .navigation) {
                LedgerSwitcherMenu(isShowingManage: $isShowingLedgerManager, iconOnly: true)
            }
            ToolbarItem(placement: .primaryAction) {
                monthCalendarButton
            }
            ToolbarItem(placement: .primaryAction) {
                statsButton
            }
            #endif
        }
        // The overview card's two budget detail pages — registered on the
        // page rather than inside the card: the card renders in the entry
        // list's lazy row, and a navigationDestination inside a List is
        // ignored in a future release. Both pages read the live report
        // off the shared report store and register their own row drills
        // (a destination registered on the page BELOW triggered from a
        // pushed page replaces this page instead of stacking); the yearly
        // breakdown is reached from the monthly page's entry row.
        .navigationDestination(isPresented: $isShowingMonthBudgetDetail) {
            MonthlyBudgetDetailView()
        }
        .navigationDestination(isPresented: $isShowingCategoryDetail) {
            CategoryBudgetDetailView()
        }
        // The chart page: the stats component for the month window and
        // the filters active at tap time (the same push the journal
        // page's toolbar button makes). Page-level registration — never
        // inside the entry list's lazy container.
        .navigationDestination(item: $statsTarget) { target in
            JournalStatsView(
                ledger: target.ledger,
                window: target.window,
                filters: target.filters
            )
        }
        .navigationDestination(isPresented: $isShowingMonthCalendar) {
            if let ledger = ledgerStore.activeLedger {
                MonthCalendarView(ledger: ledger)
            }
        }
        .task(id: dashboardTaskKey) {
            // In project scope the detail view drives its own loading, so
            // we skip the dashboard fetches to avoid double-loading the
            // same ledger. The task key re-fires when the project scope
            // settles, so a skip during the loading window is retried
            // after it resolves.
            if showsProjectDetail { return }
            guard let ledger = ledgerStore.activeLedger else { return }
            // The month's records load for every reader — guests included
            // (the list endpoint works for them); the report endpoints
            // below 403 guests, so the budget/stat/spending fetches stay
            // behind the role guard.
            // A ledger switch must not carry the previous ledger's manual
            // project filter into this one's list (its id is meaningless
            // here) — the same projection rule the journal page runs
            // before its load. The dashboard is always ledger-scope, so
            // the scope side is permanently nil.
            monthEntryStore.syncScopeProjection(ledgerId: ledger.id, scopeProjectId: nil)
            await monthEntryStore.aim(
                ledgerId: ledger.id, window: AppDates.monthWindow()
            )
            // The funnel sheet's participant picker reads this roster;
            // guests load it too (their fixed members tab proves the
            // endpoint works for them).
            await memberStore.load(ledgerId: ledger.id, myUserId: nil)
            // Month writes go through the silent setter: this task fetches
            // immediately below, so the didSet-driven debounced reload
            // would only duplicate the request. This page's share of the
            // fetch is the budget card (plus the ledger-change windowed
            // preload); the stats component fetches its own payloads
            // through `StatsStore`.
            //
            // The ledger-wide report endpoints require viewer+ and always
            // 403 guests, so guests fetch nothing here — their stats live
            // in the project detail view.
            guard !ledger.isGuest else { return }
            store.setBudgetMonthSilently(.current)
            await store.load(ledgerId: ledger.id)
            // The category budget card is annual — it re-aims on neither
            // the month stepper (this task key excludes it) nor the
            // windowed reloads, only on ledger change (this task re-fires),
            // pull-to-refresh, posting, and the settings page's writes.
            await store.loadCategoryBudget(ledgerId: ledger.id, year: AppDates.currentYear)
            // The spending card's year window is stepper-independent the
            // same way — ledger change and this task's re-runs re-aim it;
            // posts and edits re-summarize it through the epoch below.
            // It follows the header filters like the stat block does.
            await rangeStore.load(ledgerId: ledger.id, filters: statsFilters)
        }
        // A post/update/delete anywhere bumps the shared epoch — the
        // spending card and the month list both move with it (the list
        // re-read is the Journal tab's own epoch rule, so a fresh post
        // lands without a pull). Guests get the list refresh only; the
        // report endpoints 403 them.
        .onChange(of: store.journalEpoch) {
            guard !showsProjectDetail, let ledger = ledgerStore.activeLedger else { return }
            if ledger.isGuest {
                Task { await monthEntryStore.reload() }
            } else {
                Task {
                    async let entries: () = monthEntryStore.reload()
                    async let range: () = rangeStore.load(
                        ledgerId: ledger.id, filters: statsFilters
                    )
                    _ = await (entries, range)
                }
            }
        }
        // Any structural pick reshapes the range card's fetch the way it
        // reshapes the list: the overview stat block re-fetches through
        // the cards' own load key (its mount carries the live capture),
        // the list through the store's didSet reloads. Watching the
        // capture (not individual fields) keeps the card glued to every
        // axis the sheet grows; the search field doesn't fire it — the
        // search stays a list mechanic.
        .onChange(of: statsFilters) {
            reloadRangeCard()
        }
        // The projects cache refreshing is also when a project can flip
        // to archived elsewhere — drop a manual filter it carried, or
        // the sheet would render its row blank over a still-filtered
        // list (the journal page's same upkeep).
        .onChange(of: projectFilterOptions.map(\.id)) {
            dropArchivedProjectFilter()
        }
        .refreshable {
            if showsProjectDetail {
                // ProjectDetailView owns its own refresh path.
                return
            }
            guard let ledger = ledgerStore.activeLedger else { return }
            if ledger.isGuest {
                // The records are the guest dashboard's only live data.
                await monthEntryStore.reload()
                return
            }
            async let budget: () = store.refreshBudget()
            async let categoryBudget: () = store.loadCategoryBudget(
                ledgerId: ledger.id, year: AppDates.currentYear
            )
            async let stats: () = statsStore.load(
                ledgerId: ledger.id, window: statsWindow,
                filters: statsFilters,
                includesDaily: false, includesCategories: false
            )
            async let range: () = rangeStore.load(
                ledgerId: ledger.id, filters: statsFilters
            )
            async let entries: () = monthEntryStore.reload()
            _ = await (budget, categoryBudget, stats, range, entries)
        }
        .sheet(isPresented: $isShowingLedgerForm) {
            NavigationStack {
                LedgerFormView(ledger: nil)
            }
        }
        .sheet(isPresented: $isShowingJoin) {
            JoinLedgerScanView()
        }
        // Presented here instead of from the switcher's toolbar menu: a
        // sheet attached inside `ToolbarItem` content is cancelled when the
        // toolbar rebuilds mid-presentation — with no active ledger, the
        // sheet's ledger load flips this page's loading branch above and
        // would dismiss it instantly. The Group's identity is stable across
        // that branch switch, so the sheet survives.
        .sheet(isPresented: $isShowingLedgerManager) {
            NavigationStack {
                LedgersView(expandGuestLedgers: ledgerStore.activeLedger?.isGuest ?? false)
            }
        }
        // The stat card's drill-downs: the selected month's journal
        // filtered to the tapped figure (and to the header's structural
        // filters, so the rows reconcile with it), PUSHED rather than
        // sheet-mounted. The window is the dashboard's current month —
        // NOT the payload's echoed `dashboard.month`, which is a UTC
        // bucket and can read one month early east of UTC. Push, not
        // sheet: a searchable sheet below the edit cover's sub-presentation
        // remounts the cover's content on every presentation edge (iOS 26
        // quirk — the full story on StatKindDetailView); a push adds no
        // presentation host, so this chain matches the journal tab's.
        .navigationDestination(item: $statDetailTarget) { target in
            StatKindDetailView(
                ledger: target.ledger,
                filter: target.filter,
                window: target.windowOverride ?? statsWindow,
                day: target.day,
                filters: target.filters
            )
        }
    }

    /// The month view page's toolbar button (calendar icon, left of the
    /// stats button). Ungated here — the capsule group below owns the
    /// ledger-scope gate both buttons share.
    private var monthCalendarButton: some View {
        Button {
            isShowingMonthCalendar = true
        } label: {
            Image(systemName: "calendar")
        }
        .accessibilityLabel(Text(L10n.string(
            "dashboard.monthView",
            defaultValue: "Month view"
        )))
    }

    /// The chart page's toolbar button (chart icon, right of the
    /// calendar) — the same push the journal page's button makes: the
    /// stats component for the month window and the filters active at
    /// tap time. Ungated here — the capsule group below owns the gate.
    private var statsButton: some View {
        StatsEntryButton {
            guard let ledger = ledgerStore.activeLedger else { return }
            statsTarget = StatsTarget(
                ledger: ledger,
                window: statsWindow,
                filters: statsFilters
            )
        }
    }

    /// The calendar and stats buttons as ONE trailing capsule with a
    /// hairline divider between them (the shared ToolbarDividerGroup).
    /// Ledger scope only: the page summarizes the ledger-wide month —
    /// project scope swaps this whole page — and guests 403 the report
    /// endpoints the buttons' pages fetch from. Both buttons hide with
    /// this one gate, so the divider can never outlive either side.
    @ViewBuilder
    private var calendarStatsGroup: some View {
        if !showsProjectDetail, ledgerStore.activeLedger?.isGuest == false {
            ToolbarDividerGroup(showsDivider: true) {
                monthCalendarButton
            } trailing: {
                statsButton
            }
        }
    }

    /// Opens a month drill for one kind (the stat card's expense hero /
    /// income column).
    private func openStatDetail(kind: QuickEntryKind) {
        openStatDetail(JournalDrillDown(kind: kind))
    }

    /// Opens a drill-down, capturing the active ledger snapshot — without
    /// an active ledger there is nothing to drill into, and the page must
    /// never present target-less. `categoryLabel`, when set, swaps the
    /// page title to "时间 · 分类" instead of the kind. `day`, when set,
    /// windows to that single LOCAL day (the calendar card's cell and the
    /// trend card's bubble) instead of the month. The header filters ride
    /// along (the live capture at tap time): the drill's rows must
    /// reconcile with the filtered figure the user tapped.
    private func openStatDetail(_ drill: JournalDrillDown, day: Date? = nil, windowOverride: MonthWindow? = nil) {
        pushStatDetail(drill, day: day, windowOverride: windowOverride, filters: statsFilters)
    }

    private func pushStatDetail(
        _ drill: JournalDrillDown,
        day: Date?,
        windowOverride: MonthWindow?,
        filters: StatsFilters?
    ) {
        guard let ledger = ledgerStore.activeLedger else { return }
        statDetailTarget = StatDetailTarget(
            ledger: ledger,
            filter: drill,
            day: day,
            windowOverride: windowOverride,
            filters: filters
        )
    }

    /// The list's structural filters as they read right now — the cards'
    /// fetches (overview stat block, range card) and the stat drills
    /// share the store's live capture (see `JournalStore.statsFilters`).
    private var statsFilters: StatsFilters? {
        monthEntryStore.statsFilters
    }

    /// Re-fetches the range card for the filters' current shape. Guests
    /// never fetch it (the endpoint 403s them); in project scope the
    /// whole summary is off the screen.
    private func reloadRangeCard() {
        guard !showsProjectDetail, let ledger = ledgerStore.activeLedger, !ledger.isGuest else { return }
        Task { await rangeStore.load(ledgerId: ledger.id, filters: statsFilters) }
    }

    /// Projects of the active ledger, from the app-level per-ledger cache
    /// — kept warm by the ledger switcher's own load. Read here only for
    /// the archived-filter drop; the funnel sheet derives its own options.
    private var projectFilterOptions: [QianlaiProject] {
        guard let ledger = ledgerStore.activeLedger else { return [] }
        return projectStore.activeProjects(for: ledger.id)
    }

    /// Drops a manual project filter that no longer points at an active
    /// project. The dashboard is never scoped, so every pick here is
    /// manual (the journal page exempts its scoped sessions).
    private func dropArchivedProjectFilter() {
        guard let filterId = monthEntryStore.projectFilterId,
              !projectFilterOptions.contains(where: { $0.id == filterId })
        else { return }
        monthEntryStore.projectFilterId = nil
    }

    /// The month window the cards (and drill-downs) summarize — the
    /// header's selected month as a `MonthWindow`, the same shape the
    /// stats component and the drill page take.
    private var statsWindow: MonthWindow {
        AppDates.monthWindow()
    }

    /// The month summary above the selected month's records — the
    /// summary as one chrome-free topContent row of the shared entry
    /// list (the same composition the month view page uses), so the
    /// cards keep the inset-grouped metrics they were tuned against
    /// (horizontal margins from the list itself, wallpaper behind).
    private func dashboardSummary(_ ledger: QianlaiLedger) -> some View {
        EntryListView(
            ledger: ledger,
            emptyMessage: L10n.string("journal.empty", defaultValue: "No entries yet"),
            // A browsing surface like the drill pages: no posting
            // footnote; posters keep the swipe actions.
            showsPostHint: false,
            topContent: AnyView(monthSummary(ledger)),
            showsShareCaption: true
        )
        .environment(monthEntryStore)
        .scrollBounceBehavior(.basedOnSize)
    }

    /// The month header's trailing controls — the journal header's
    /// arrangement (filter funnel + amount sort, borderless, hugging the
    /// list's small inset). They drive the private month entry store, so
    /// the list, its day headers, the stat block, and the range card all
    /// follow one filter state. The window stays out of their reach: the
    /// dashboard is pinned to the current month, so the funnel's Clear
    /// runs the structural-only clear — the sheet may never unpin the
    /// page.
    private var headerControls: some View {
        HStack(spacing: 8) {
            JournalFilterButton(
                store: monthEntryStore,
                ledgerStore: ledgerStore,
                projectStore: projectStore,
                memberStore: memberStore,
                clearAction: { monthEntryStore.clearStructuralFilters() }
            )
            JournalSortMenu(store: monthEntryStore)
                .buttonStyle(.borderless)
        }
    }

    /// Current-month title, the merged budget overview card, and the
    /// reusable stats component's (headless) data mount — laid out by the
    /// shared summary chrome (the screenshot harness stacks the same way,
    /// so the spacings can't drift between the two).
    private func monthSummary(_ ledger: QianlaiLedger) -> some View {
        dashboardSummaryStack(
            title: AppDates.formatMonthTitle(.current, locale: locale),
            trailing: { headerControls }
        ) {
            // The overview card rides directly under the month header:
            // the stats block (expense hero + income/net) is its top
            // section and renders for EVERY reader — guests included,
            // who read the placeholder states exactly like the old
            // standalone stats card. The budget sections render from the
            // report payloads, which a guest never fetches (the report
            // endpoints 403 them) — but the report store's creation seed
            // can still hand their store a previous ledger's record, and
            // their task returns before any fetch could correct it, so
            // the guest gate nils the budget inputs here (the stale-card
            // guard, moved inside the merged card's parameters).
            BudgetCardView(
                statsTotals: statsStore.overview?.month,
                statsExpenseAction: { openStatDetail(kind: .expense) },
                statsIncomeAction: { openStatDetail(kind: .income) },
                month: ledger.isGuest ? nil : store.budget?.month,
                categoryBudget: ledger.isGuest ? nil : store.categoryBudget,
                currency: ledger.currency,
                isMonthDetailPresented: $isShowingMonthBudgetDetail,
                isCategoryDetailPresented: $isShowingCategoryDetail
            )
            // The today/week/year card — anchored to NOW, not a month
            // stepper. Each row drills into the period's journal. Guests
            // never see it: the daily-summary endpoint 403s them.
            if !ledger.isGuest {
                RangeTotalsCard(
                    store: rangeStore,
                    currency: ledger.currency,
                    locale: locale,
                    todayAction: {
                        openStatDetail(JournalDrillDown(kind: nil), day: .now)
                    },
                    weekAction: {
                        openStatDetail(
                            JournalDrillDown(kind: nil),
                            windowOverride: RangeTotalsMath.weekWindow(
                                for: .now, calendar: .current
                            )
                        )
                    },
                    yearAction: {
                        openStatDetail(
                            JournalDrillDown(kind: nil),
                            windowOverride: RangeTotalsMath.yearWindow(
                                for: .now, calendar: .current
                            )
                        )
                    }
                )
                // 2pt above the stack's own 10 — the user's 12pt pick for
                // the overview→range pair, tighter than the 20pt rhythm.
                .summaryCardGap(2)
            }
        }
        // The stats component's data mount — the overview block renders
        // inside the budget card above (rendersOverview: false), so this
        // surface exists only to keep the fetch / debounce / epoch-refresh
        // / snapshot-liveness lifecycle running for the shared store. It
        // hangs OFF the stack in an overlay, never inside it: a zero-size
        // view still earns VStack spacing on both sides, which is exactly
        // the 30pt gap that crept between the two cards when this mount
        // sat in the flow (2026-09-24). Guests pass isReportingEnabled:
        // false — every report endpoint 403s them. The drills live on the
        // budget card now; the calendar stays on the month view page, the
        // trend/composition charts on the journal's chart page.
        .overlay {
            StatsCardsView(
                store: statsStore,
                ledgerId: ledger.id,
                currency: ledger.currency,
                isReportingEnabled: !ledger.isGuest,
                showsTrendAndComposition: false,
                window: statsWindow,
                // The header's live capture: the store's load key
                // carries the filter token, so a funnel pick re-fetches
                // the overview the same way a window step would. Filtered
                // fetches never republish the widget snapshot (the
                // store-side rule), and the creation seed above stays
                // the unfiltered record — the launch surface's shape.
                filters: statsFilters,
                rendersOverview: false
            )
        }
    }
}

/// The dashboard summary's shared chrome — the month title (with an
/// optional trailing control slot on the same row), the base stack
/// rhythm, and the outer top padding — used by the real page AND the
/// `--ui-demo-range-card` screenshot harness, so the demo measures the
/// real geometry by construction instead of by keeping copies in step.
/// Cards after the first carry `.summaryCardGap()` themselves.
func dashboardSummaryStack(
    title: String,
    @ViewBuilder trailing: () -> some View = { EmptyView() },
    @ViewBuilder content: () -> some View
) -> some View {
    VStack(alignment: .leading, spacing: 10) {
        // A static label, not a stepper: the dashboard is pinned to the
        // current month — history browsing lives on the month view page,
        // which steps its own header. The trailing slot carries the
        // header's controls on the surfaces that mount them.
        HStack {
            Text(title)
                .font(.title3.weight(.semibold))
            Spacer(minLength: 12)
            trailing()
        }
        // The same little inset the chrome-less rows carry.
        .padding(.horizontal, 6)
        content()
    }
    // Horizontal margins come from the inset-grouped list itself;
    // top padding spaces the summary off the screen edge under the
    // large title — the bottom stays flush so the summary-to-list gap
    // matches the day cards' section rhythm (the system's 20pt
    // section spacing + header lead already read like one more
    // day-card gap).
    .padding(.top, 8)
}

extension View {
    /// One summary card's share of the card-to-card rhythm: base VStack
    /// 10 + this 10 = the journal list's 20pt day-card spacing. Every
    /// summary card but the first carries it. A smaller value tightens
    /// one pair below the rhythm — the range card sits 2pt under the
    /// overview card (10 + 2 = 12pt total, 2026-09-24 user pick).
    func summaryCardGap(_ spacing: CGFloat = 10) -> some View {
        padding(.top, spacing)
    }
}
