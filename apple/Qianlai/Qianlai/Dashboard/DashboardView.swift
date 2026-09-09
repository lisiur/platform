//
//  DashboardView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

/// Overview of the active ledger: a pull-down system search field (the
/// category picker's drawer search, querying the displayed month only), a
/// scrolling month summary — month header, expense card, income/net hints
/// — that travels with the month's entries on the same shared entry list
/// the Journal uses, limited to a month window instead of exposing every
/// filter.
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
    /// Month the cards and the entry list summarize; stepped with the
    /// chevrons in the month header, capped at the current month.
    @State private var selectedMonth = YearMonth.current
    /// Month-window entry store; a local instance (injected below) so its
    /// filter window never clashes with the Journal tab's root store.
    @State private var entryStore = JournalStore()
    /// System search field (pull-down drawer, like the category picker's):
    /// hidden until pulled down, expands over the title when focused.
    /// Writes go straight to the month store, whose reload task already
    /// coalesces keystrokes — and whose request keeps the month window,
    /// so it only ever searches the displayed month.
    @State private var searchField = ""

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

    /// Key for the dashboard fetch task: active ledger plus the project
    /// scope state the skip decision depends on. Reacting to the scope
    /// settling matters — the loading-window early return below must be
    /// retried once `ProjectStore.load` finishes without producing a
    /// project (guest with zero projects), or the dashboard would never
    /// fetch entries/stats for that ledger.
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
                    EntryListView(
                        ledger: ledger,
                        emptyMessage: L10n.string(
                            "dashboard.noEntriesThisMonth",
                            defaultValue: "No entries this month yet"
                        ),
                        showsViewerShare: true,
                        topContent: AnyView(monthSummary)
                    )
                    #if os(iOS)
                    // Pull-down drawer search like the category picker's:
                    // hidden until the list is pulled down, and it takes
                    // over the page top (title included) while focused.
                    .searchable(
                        text: $searchField,
                        placement: .navigationBarDrawer(displayMode: .automatic),
                        prompt: Text(L10n.string("journal.search.placeholder", defaultValue: "Search…"))
                    )
                    #else
                    .searchable(
                        text: $searchField,
                        prompt: Text(L10n.string("journal.search.placeholder", defaultValue: "Search…"))
                    )
                    #endif
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
        .environment(entryStore)
        // Large title like the assets page's, not the tab-chrome inline
        // style. In project scope ProjectDetailView's own (hidden) title
        // takes precedence.
        .navigationTitle(Text(L10n.string("dashboard.title", defaultValue: "Dashboard")))
        .toolbar {
            #if os(iOS)
            ToolbarItem(placement: .topBarLeading) {
                LedgerSwitcherMenu(isShowingManage: $isShowingLedgerManager)
            }
            ToolbarItem(placement: .topBarTrailing) {
                collaborationMenu
            }
            #else
            ToolbarItem(placement: .navigation) {
                LedgerSwitcherMenu(isShowingManage: $isShowingLedgerManager)
            }
            ToolbarItem(placement: .primaryAction) {
                collaborationMenu
            }
            #endif
        }
        .task(id: dashboardTaskKey) {
            // In project scope the detail view drives its own loading, so
            // we skip the dashboard fetches to avoid double-loading the
            // same ledger. The task key re-fires when the project scope
            // settles, so a skip during the loading window is retried
            // after it resolves.
            if showsProjectDetail { return }
            guard let ledger = ledgerStore.activeLedger else { return }
            // Month and window writes go through the silent setters: this
            // task fetches immediately below, so the didSet-driven
            // debounced reloads would only duplicate the requests.
            //
            // The ledger-wide report endpoints require viewer+ and always
            // 403 guests, so guests fetch only the (guest-scoped) entry
            // list — their stats live in the project detail view.
            if !ledger.isGuest {
                store.setDashboardMonthSilently(selectedMonth)
                await store.load(ledgerId: ledger.id)
            }
            let window = AppDates.monthWindow(containing: selectedMonth.start)
            entryStore.setWindow(from: window.from, to: window.to)
            await entryStore.load(ledgerId: ledger.id)
        }
        .onChange(of: selectedMonth) { _, month in
            // Window writes schedule the entries reload; dashboardMonth's
            // didSet schedules the dashboard reload (skipped for guests —
            // the report endpoint 403s for them).
            if showsProjectDetail { return }
            if let ledger = ledgerStore.activeLedger, !ledger.isGuest {
                store.dashboardMonth = month
            }
            let window = AppDates.monthWindow(containing: month.start)
            entryStore.fromDate = window.from
            entryStore.toDate = window.to
        }
        .onChange(of: searchField) { _, newValue in
            entryStore.searchQuery = newValue
        }
        .refreshable {
            if showsProjectDetail {
                // ProjectDetailView owns its own refresh path.
                return
            }
            if let ledger = ledgerStore.activeLedger, !ledger.isGuest {
                await store.loadDashboard()
            }
            await entryStore.reload()
        }
        // A post/update/delete elsewhere (quick-entry sheet, Journal tab)
        // bumps this; this page's private entry store is invisible to those
        // callers, so it refetches itself here.
        .onChange(of: store.journalEpoch) { _, _ in
            if !showsProjectDetail {
                Task { await entryStore.reload() }
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

    /// Month-list ordering menu, pinned to the month header's trailing
    /// edge. Writes go to the month store whose sort change schedules the
    /// reload; the flat/grouped row rendering follows the same state inside
    /// EntryListView.
    private var sortMenu: some View {
        Menu {
            sortMenuItem(.date, title: L10n.string("dashboard.sortByDate", defaultValue: "By date"))
            sortMenuItem(
                .amountDescending,
                title: L10n.string("dashboard.sortAmountDesc", defaultValue: "Amount: high to low")
            )
            sortMenuItem(
                .amountAscending,
                title: L10n.string("dashboard.sortAmountAsc", defaultValue: "Amount: low to high")
            )
        } label: {
            Image(systemName: "arrow.up.arrow.down")
                .frame(width: 32, height: 32)
                .background(Circle().fill(Color.primary.opacity(0.06)))
        }
        .accessibilityLabel(L10n.string("dashboard.sort", defaultValue: "Sort"))
    }

    /// One ordering option; the active one carries the checkmark (the
    /// menu-selection pattern the members page uses).
    private func sortMenuItem(_ sort: JournalStore.EntrySort, title: String) -> some View {
        Button {
            entryStore.sort = sort
        } label: {
            if entryStore.sort == sort {
                Label(title, systemImage: "checkmark")
            } else {
                Text(title)
            }
        }
    }

    /// Mirrors the projects list's create gate exactly: the project form
    /// posts into the active ledger, so it needs one, active, with the
    /// caller at editor or above.
    private var canCreateProject: Bool {
        guard let ledger = ledgerStore.activeLedger else { return false }
        return LedgerPolicy.canManageProjects(role: ledger.myRole, ledgerActive: ledger.isActive)
    }

    /// The month header + expense card, mounted as the entry list's first
    /// scrolling row (row background/insets cleared by EntryListView) so
    /// it travels with the records instead of staying pinned.
    private var monthSummary: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Arrows hug the title as one leading group; the sort menu
            // occupies the trailing space.
            HStack(spacing: 8) {
                Button {
                    selectedMonth = selectedMonth.previous
                } label: {
                    Image(systemName: "chevron.left")
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(Color.primary.opacity(0.06)))
                }
                // Borderless: with the default style a tap on the List row
                // fires BOTH chevrons, canceling each other out.
                .buttonStyle(.borderless)
                Text(AppDates.formatMonthTitle(selectedMonth, locale: locale))
                    .font(.headline)
                Button {
                    selectedMonth = selectedMonth.next
                } label: {
                    Image(systemName: "chevron.right")
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(Color.primary.opacity(0.06)))
                }
                .buttonStyle(.borderless)
                .disabled(selectedMonth >= YearMonth.current)
                Spacer()
                sortMenu
                    .buttonStyle(.borderless)
            }
            // The expense card spans the summary's width; the chrome-less
            // rows above and below it are inset a little instead.
            .padding(.horizontal, 6)
            StatCard(
                icon: "wallet.bifold",
                label: L10n.string("account.type.expense", defaultValue: "Expense"),
                value: store.dashboard?.month.totalExpense,
                currency: ledgerStore.activeLedger?.currency,
                tone: .negative
            )
            HStack(spacing: 16) {
                monthHint(
                    L10n.string("account.type.income", defaultValue: "Income"),
                    value: store.dashboard?.month.totalIncome,
                    tone: .positive
                )
                monthHint(
                    L10n.string("common.net", defaultValue: "Net"),
                    value: store.dashboard?.month.net,
                    // Finance convention: negative net green (绿跌),
                    // non-negative red (红涨).
                    tone: (store.dashboard?.month.net ?? 0) < 0 ? .negative : .positive
                )
            }
            .padding(.horizontal, 6)
        }
        // Horizontal margins come from the inset-grouped list itself, so
        // the summary lines up with the day cards below; vertical padding
        // spaces it off the pinned search bar and the first card.
        .padding(.vertical, 8)
    }

    /// Secondary income/net figure: plain label + tone-colored amount,
    /// no card chrome — the expense card is the hero figure.
    private func monthHint(
        _ label: String,
        value: Double?,
        tone: StatCard.Tone
    ) -> some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value.map { Money.format($0, currency: ledgerStore.activeLedger?.currency) } ?? "—")
                .font(.caption.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(tone.color ?? Color.primary)
                .lineLimit(1)
        }
    }
}
