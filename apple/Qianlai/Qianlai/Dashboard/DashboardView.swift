//
//  DashboardView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

/// Overview of the active ledger: month header above an expense summary
/// card (income/net shown as text hints) and the month's entries — the
/// same shared entry list the Journal uses, limited to a month window
/// instead of exposing every filter.
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
    @State private var isShowingInvite = false
    @State private var isShowingJoin = false
    @State private var isShowingLedgerManager = false
    /// Month the cards and the entry list summarize; stepped with the
    /// chevrons in the month header, capped at the current month.
    @State private var selectedMonth = YearMonth.current
    /// Month-window entry store; a local instance (injected below) so its
    /// filter window never clashes with the Journal tab's root store.
    @State private var entryStore = JournalStore()

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
    private var isProjectScopeLoading: Bool {
        guard let ledger = ledgerStore.activeLedger else { return false }
        guard ledger.isGuest || projectStore.selectedProjectId != nil else { return false }
        return activeProject == nil && projectStore.isLoading
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
                        )
                    )
                    // Pinned above the list like the Journal's search
                    // bar: takes the page's top padding instead of
                    // scrolling away as a list row.
                    .safeAreaInset(edge: .top, spacing: 0) {
                        monthSummary
                    }
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
                            Label("Create Ledger", systemImage: "plus")
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        Button {
                            isShowingJoin = true
                        } label: {
                            Label("Join via qrcode", systemImage: "qrcode")
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                    }
                }
            }
        }
        .environment(entryStore)
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
            guard let id = ledgerStore.activeLedger?.id else { return }
            // Both surfaces follow the selected month; ReportStore remembers
            // it so post-delete refreshes re-summarize the same month.
            store.dashboardMonth = selectedMonth
            await store.load(ledgerId: id)
            let window = AppDates.monthWindow(containing: selectedMonth.start)
            entryStore.fromDate = window.from
            entryStore.toDate = window.to
            await entryStore.load(ledgerId: id)
        }
        .onChange(of: selectedMonth) { _, month in
            // Window writes schedule the entries reload; dashboardMonth's
            // didSet schedules the dashboard reload.
            if showsProjectDetail { return }
            store.dashboardMonth = month
            let window = AppDates.monthWindow(containing: month.start)
            entryStore.fromDate = window.from
            entryStore.toDate = window.to
        }
        .refreshable {
            if showsProjectDetail {
                // ProjectDetailView owns its own refresh path.
                return
            }
            await store.loadDashboard()
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
        .sheet(isPresented: $isShowingInvite) {
            // The invite surface follows the dashboard's scope: a
            // project-scoped manager invites guests to the project,
            // otherwise the ledger owner invites members via share codes.
            if let project = activeProject, let ledger = ledgerStore.activeLedger {
                NavigationStack {
                    ProjectInviteView(ledgerId: ledger.id, project: project)
                }
            } else if let ledger = ledgerStore.activeLedger {
                NavigationStack {
                    LedgerInviteView(ledger: ledger)
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

    /// Top-right collaboration menu: invite others to the current scope
    /// and join someone else's ledger with a share code.
    private var collaborationMenu: some View {
        Menu {
            if canInvite {
                Button {
                    isShowingInvite = true
                } label: {
                    Label("Invite", systemImage: "person.badge.plus")
                }
            }
            Button {
                isShowingJoin = true
            } label: {
                Label("Join via qrcode", systemImage: "qrcode")
            }
        } label: {
            Image(systemName: "plus.circle")
        }
    }

    /// True when the active scope offers an invite surface — a project
    /// member with manage rights (project invite codes) or a ledger owner
    /// (member share codes). Mirrors the rights each invite sheet
    /// enforces so the menu never offers a dead end.
    private var canInvite: Bool {
        guard let ledger = ledgerStore.activeLedger else { return false }
        if activeProject != nil {
            return LedgerPolicy.canManageProjects(role: ledger.myRole, ledgerActive: ledger.isActive)
        }
        return LedgerPolicy.canCreateShareCode(ledger.myRole)
    }

    private var monthSummary: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
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
                Spacer()
                Text(AppDates.formatMonthTitle(selectedMonth, locale: locale))
                    .font(.headline)
                Spacer()
                Button {
                    selectedMonth = selectedMonth.next
                } label: {
                    Image(systemName: "chevron.right")
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(Color.primary.opacity(0.06)))
                }
                .buttonStyle(.borderless)
                .disabled(selectedMonth >= YearMonth.current)
            }
            // The expense card spans the summary's width; the chrome-less
            // rows above and below it are inset a little instead.
            .padding(.horizontal, 6)
            StatCard(
                icon: "wallet.bifold",
                label: "Expense",
                value: store.dashboard?.month.totalExpense,
                currency: ledgerStore.activeLedger?.currency,
                tone: .negative
            )
            HStack(spacing: 16) {
                monthHint(
                    "Income",
                    value: store.dashboard?.month.totalIncome,
                    tone: .positive
                )
                monthHint(
                    "Net",
                    value: store.dashboard?.month.net,
                    // Finance convention: negative net green (绿跌),
                    // non-negative red (红涨).
                    tone: (store.dashboard?.month.net ?? 0) < 0 ? .negative : .positive
                )
            }
            .padding(.horizontal, 6)
        }
        // Same outer spacing as the Journal's pinned search bar.
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    /// Secondary income/net figure: plain label + tone-colored amount,
    /// no card chrome — the expense card is the hero figure.
    private func monthHint(
        _ label: LocalizedStringKey,
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
