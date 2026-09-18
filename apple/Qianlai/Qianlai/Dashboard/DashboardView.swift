//
//  DashboardView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

/// Overview of the active ledger: a scrolling month summary — month
/// header, budget card, the expense card carrying the income/net figures
/// inside it, and the two chart cards (month trend, composition) — for the
/// selected month. The entries list that used to ride beneath the summary
/// lives on the Journal tab only; this page summarizes, it doesn't list.
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
    @State private var isShowingNewProject = false
    @State private var isShowingJoin = false
    @State private var isShowingLedgerManager = false
    /// Push flag for the budget card's yearly breakdown. Owned here, not in
    /// BudgetCardView, so the `navigationDestination` registration below sits
    /// on the page rather than inside a lazy container, per the
    /// navigationDestination contract.
    @State private var isShowingYearDetail = false
    /// Month the cards summarize; stepped with the chevrons in the month
    /// header, capped at the current month.
    @State private var selectedMonth = YearMonth.current

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
            } else if ledgerStore.activeLedger != nil {
                if let project = activeProject {
                    ProjectDetailView(projectId: project.id, hidesNavigationTitle: true)
                } else if isProjectScopeLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    dashboardSummary
                }
            } else {
                VStack(spacing: 28) {
                    EmptyStateView(
                        message: L10n.string("dashboard.selectLedger", defaultValue: "Select a ledger to get started"),
                        systemImage: "book"
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
                    ?? L10n.string("dashboard.title", defaultValue: "Dashboard")
            )
        )
        .toolbar {
            #if os(iOS)
            ToolbarItem(placement: .topBarLeading) {
                LedgerSwitcherMenu(isShowingManage: $isShowingLedgerManager, iconOnly: true)
            }
            ToolbarItem(placement: .topBarTrailing) {
                collaborationMenu
            }
            #else
            ToolbarItem(placement: .navigation) {
                LedgerSwitcherMenu(isShowingManage: $isShowingLedgerManager, iconOnly: true)
            }
            ToolbarItem(placement: .primaryAction) {
                collaborationMenu
            }
            #endif
        }
        // Budget card's yearly breakdown, registered on the page rather than
        // inside the card: the card renders in the entry list's lazy row, and
        // a navigationDestination inside a List is ignored in a future
        // release — the registration must stay visible to the stack at all
        // times, so the card only raises the flag.
        .navigationDestination(isPresented: $isShowingYearDetail) {
            BudgetYearDetailView()
        }
        .task(id: dashboardTaskKey) {
            // In project scope the detail view drives its own loading, so
            // we skip the dashboard fetches to avoid double-loading the
            // same ledger. The task key re-fires when the project scope
            // settles, so a skip during the loading window is retried
            // after it resolves.
            if showsProjectDetail { return }
            guard let ledger = ledgerStore.activeLedger, !ledger.isGuest else { return }
            // Month writes go through the silent setter: this task fetches
            // immediately below, so the didSet-driven debounced reload
            // would only duplicate the request.
            //
            // The ledger-wide report endpoints require viewer+ and always
            // 403 guests, so guests fetch nothing here — their stats live
            // in the project detail view.
            store.setDashboardMonthSilently(selectedMonth)
            await store.load(ledgerId: ledger.id)
        }
        .onChange(of: selectedMonth) { _, month in
            // dashboardMonth's didSet schedules the debounced dashboard
            // reload (skipped for guests — the report endpoint 403s them).
            if showsProjectDetail { return }
            if let ledger = ledgerStore.activeLedger, !ledger.isGuest {
                store.dashboardMonth = month
            }
        }
        .refreshable {
            if showsProjectDetail {
                // ProjectDetailView owns its own refresh path.
                return
            }
            if let ledger = ledgerStore.activeLedger, !ledger.isGuest {
                await store.loadDashboard()
            }
        }
        .sheet(isPresented: $isShowingLedgerForm) {
            NavigationStack {
                LedgerFormView(ledger: nil)
            }
        }
        .sheet(isPresented: $isShowingNewProject) {
            // The form posts into the active ledger; the menu item is only
            // reachable when one exists, but re-check so a scope switch
            // mid-presentation can't present a target-less form.
            if ledgerStore.activeLedger != nil {
                NavigationStack {
                    ProjectFormView(project: nil)
                }
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
    }

    /// Top-right collaboration menu: create a ledger (any signed-in user
    /// can own one), create a project in the active ledger (editor+,
    /// mirrors the projects list gate), and join someone else's ledger
    /// with a share code. Inviting lives on the members page (ledger)
    /// and the projects list (project).
    private var collaborationMenu: some View {
        Menu {
            Button {
                isShowingLedgerForm = true
            } label: {
                Label(
                    L10n.string("ledgers.create", defaultValue: "Create Ledger"),
                    systemImage: "book.badge.plus"
                )
            }
            if canCreateProject {
                Button {
                    isShowingNewProject = true
                } label: {
                    Label(
                        L10n.string("projects.create", defaultValue: "New Project"),
                        systemImage: "folder.badge.plus"
                    )
                }
            }
            Button {
                isShowingJoin = true
            } label: {
                Label(L10n.string("dashboard.joinViaQrcode", defaultValue: "Join via qrcode"), systemImage: "qrcode")
            }
        } label: {
            Image(systemName: "plus")
        }
    }

    /// Mirrors the projects list's create gate exactly: the project form
    /// posts into the active ledger, so it needs one, active, with the
    /// caller at editor or above.
    private var canCreateProject: Bool {
        guard let ledger = ledgerStore.activeLedger else { return false }
        return LedgerPolicy.canManageProjects(role: ledger.myRole, ledgerActive: ledger.isActive)
    }

    /// The month summary stands alone on the page — one chrome-free list
    /// row so the cards keep the inset-grouped metrics they were tuned
    /// against (horizontal margins from the list itself, wallpaper behind),
    /// the same row chrome `EntryListView` gave the summary when it rode
    /// above the records.
    private var dashboardSummary: some View {
        List {
            monthSummary
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
        }
        .appBackgroundCanvas()
        .scrollBounceBehavior(.basedOnSize)
    }

    /// Month header, budget card, stat card, and the two chart cards.
    private var monthSummary: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Arrows hug the title; nothing trails the header anymore —
            // the filter/sort menus acted on the removed entry list.
            HStack(spacing: 8) {
                Button {
                    selectedMonth = selectedMonth.previous
                } label: {
                    CircleIcon(systemName: "chevron.left")
                }
                // Borderless: with the default style a tap on the List row
                // fires BOTH chevrons, canceling each other out.
                .buttonStyle(.borderless)
                Text(AppDates.formatMonthTitle(selectedMonth, locale: locale))
                    .font(.title3.weight(.semibold))
                Button {
                    selectedMonth = selectedMonth.next
                } label: {
                    CircleIcon(systemName: "chevron.right")
                }
                .buttonStyle(.borderless)
                .disabled(selectedMonth >= YearMonth.current)
                Spacer()
            }
            // The expense card spans the summary's width; the chrome-less
            // rows above and below it are inset a little instead.
            .padding(.horizontal, 6)
            // The budget card rides directly under the month header so the
            // "how much is left" answer is the first thing on the page. It
            // renders only when a budget is set (nil report / nil month =
            // no card, and per the spec no onboarding hint either — guests
            // never even fetch it, since the report endpoint 403s them).
            if let budget = store.budget, let month = budget.month {
                BudgetCardView(
                    isYearDetailPresented: $isShowingYearDetail,
                    month: month,
                    year: budget.year,
                    currency: ledgerStore.activeLedger?.currency ?? budget.currency,
                    isCurrentMonth: selectedMonth == YearMonth.current
                )
            }
            StatSummaryBlock(
                month: store.dashboard?.month,
                currency: ledgerStore.activeLedger?.currency
            )
            // The chart cards ride the same month the stat card summarizes
            // (both fetch alongside the dashboard), so stepping months
            // re-aims all three together. Guests never fetch the reports
            // (403), so their nil payloads keep the cards hidden — the
            // stat card's gate, expressed through data.
            if let daily = store.dailySummary {
                MonthTrendChartCard(
                    days: daily,
                    currency: ledgerStore.activeLedger?.currency,
                    locale: locale
                )
            }
            if let summary = store.categorySummary {
                CategoryBreakdownCard(
                    summary: summary,
                    currency: ledgerStore.activeLedger?.currency,
                    locale: locale
                )
            }
        }
        // Horizontal margins come from the inset-grouped list itself;
        // vertical padding spaces the summary off the screen edges under
        // the large title.
        .padding(.vertical, 8)
    }
}
