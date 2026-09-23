//
//  JournalView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

/// Journal of the active ledger: searchable, paginated entry list with an
/// inline time-window tab bar under the search drawer — Week / Month / Year
/// presets stepped with dashboard-style chevrons, a Range tab whose
/// from/to editor inherits the range active at switch time, and an All tab
/// showing the ledger's entry extent — a dashboard-style stat card
/// summarizing the current window, the remaining filters (project,
/// counted, participant) in a sheet, plus quick entry and delete. The
/// page opens on the current week; the dashboard is this page pinned to
/// a month. The period tabs, window control, and funnel are the shared
/// journal filter surface (JournalFilters.swift) — the stats tab mounts
/// the same one.
struct JournalView: View {
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(JournalStore.self) private var store
    /// The app-level project store: owns the ledger switcher's scope and the
    /// per-ledger cache the filter picker reads — a local fetching instance
    /// here used to refetch the same list the switcher had just loaded.
    @Environment(ProjectStore.self) private var appProjectStore
    /// Drives the window stat card's summary fetch and the post/delete
    /// epoch the card refetches on.
    @Environment(ReportStore.self) private var reportStore
    @State private var memberStore = MemberStore()
    /// The window/funnel selection state (range pin, opening default) —
    /// the shared journal filter surface; the bounds themselves stay on
    /// the store below.
    @State private var windowModel = JournalWindowModel()
    /// Push flag for the month view page (the toolbar calendar button) —
    /// the dashboard's MonthCalendarView re-mounted here, ledger scope.
    @State private var isShowingMonthCalendar = false
    /// Share-based totals for the current window (the stat card), fetched
    /// one-shot per window change — never the shared dashboard-cards state.
    @State private var windowSummary: Dashboard?
    @State private var summaryTask: Task<Void, Never>?
    /// The chart page's push payload, captured at tap time — the list's
    /// bounds keep moving behind a push, and the pushed page must describe
    /// the window the user tapped on. nil = chart page popped. The shared
    /// payload type (with the dashboard's and the drill-downs' chart
    /// entries) lives beside the page it pushes.
    @State private var statsTarget: StatsTarget?

    var body: some View {
        Group {
            if ledgerStore.isLoading, ledgerStore.ledgers.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let ledger = ledgerStore.activeLedger {
                EntryListView(
                    ledger: ledger,
                    emptyMessage: L10n.string("journal.empty", defaultValue: "No entries yet"),
                    topContent: AnyView(rangeHeader),
                    // Ledger-wide journal only: in project scope the
                    // settlement pages own the shares (project members).
                    showsShareCaption: scopedProject == nil
                )
            } else {
                EmptyStateView(
                    message: L10n.string("dashboard.selectLedger", defaultValue: "Select a ledger to get started"),
                    systemImage: "text.book.closed"
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle(Text(L10n.string("journal.title", defaultValue: "Journal")))
        .toolbar {
            #if os(iOS)
            ToolbarItem(placement: .topBarTrailing) {
                calendarStatsGroup
            }
            #else
            ToolbarItem(placement: .primaryAction) {
                monthCalendarButton
            }
            ToolbarItem(placement: .primaryAction) {
                statsButton
            }
            #endif
        }
        // The chart page: the stats component for the tapped window and
        // the filters active at tap time. The registration lives on the
        // page (never inside a lazy container, per the
        // navigationDestination contract); the button only raises the
        // payload.
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
        .task(id: ledgerStore.activeLedger?.id) {
            guard let id = ledgerStore.activeLedger?.id else { return }
            windowModel.applyDefaultWindowOnce(in: store)
            syncScopeFilter()
            await store.load(ledgerId: id)
            await memberStore.load(ledgerId: id, myUserId: nil)
            scheduleSummaryReload()
        }
        // The scope can change while this tab stays alive (switcher on the
        // dashboard, ledger switcher inside the quick-entry sheet) or fill
        // in late as the project cache loads — follow it immediately. The
        // stat card's visibility rides along (hidden in project scope).
        .onChange(of: scopedProject?.id) {
            syncScopeFilter()
            scheduleSummaryReload()
        }
        // The projects cache refreshing is also when a project can flip to
        // archived (Projects tab, another device) — drop a manual filter it
        // carried, or the sheet would render its row blank over a still-
        // filtered list.
        .onChange(of: projectFilterOptions.map(\.id)) {
            dropArchivedProjectFilter()
        }
        // Window changes refetch the stat card, debounced like the list;
        // an emptied window (the funnel sheet's Clear) also ends a range
        // pin — its seeded range no longer exists.
        .onChange(of: store.fromDate) {
            windowModel.clearRangePinIfWindowEmpty(in: store)
            scheduleSummaryReload()
        }
        .onChange(of: store.toDate) {
            windowModel.clearRangePinIfWindowEmpty(in: store)
            scheduleSummaryReload()
        }
        // The funnel sheet's structural picks reshape the stat card's set
        // too — its summary fetch carries them (unlike the search text and
        // the show/hide toggle, which the stats caliber ignores) — so each
        // pick reloads the card the same way a window bound does. The
        // project filter also moves on scope switches, whose onChange
        // above already fires; the debounced reload coalesces.
        .onChange(of: store.participantUserId) {
            scheduleSummaryReload()
        }
        .onChange(of: store.projectFilterId) {
            scheduleSummaryReload()
        }
        // A post/update/delete anywhere bumps this; the All tab's entry
        // extent and the card's window totals must move with the list.
        .onChange(of: reportStore.journalEpoch) {
            store.refreshBounds()
            scheduleSummaryReload()
        }
        // Auto-collapsing drawer search (the dashboard's): hidden until the
        // list is pulled down, expands over the title while focused.
        .journalSearchable(store, alwaysVisible: false)
        .refreshable {
            await store.reload()
        }
    }

    /// The scrolling first row (dashboard month-summary layout): the time
    /// window tabs, then a control row carrying the window stepper or
    /// range pickers on the leading edge and the filter/sort buttons
    /// trailing — the dashboard month header's arrangement. The window
    /// tabs, the control, and the funnel are the shared journal filter
    /// surface (JournalFilters.swift). Horizontal margins come from the
    /// inset-grouped list itself; the small extra inset hugs the controls
    /// like the dashboard's.
    private var rangeHeader: some View {
        VStack(alignment: .leading, spacing: 16) {
            JournalPeriodTabs(store: store, model: windowModel)
            HStack(spacing: 8) {
                JournalWindowControl(store: store, model: windowModel)
                Spacer()
                filterButtonSortMenu
            }
            .padding(.horizontal, 6)
            if showsStats {
                StatSummaryBlock(
                    totals: windowSummary?.month,
                    currency: ledgerStore.activeLedger?.currency
                )
            }
        }
        .padding(.vertical, 8)
    }

    /// The header row's trailing controls: the funnel button (the shared
    /// component, sheet included) and the amount-order menu beside it
    /// (the shared sort menu).
    private var filterButtonSortMenu: some View {
        HStack(spacing: 8) {
            JournalFilterButton(
                store: store,
                ledgerStore: ledgerStore,
                projectStore: appProjectStore,
                memberStore: memberStore
            )
            JournalSortMenu(store: store)
                .buttonStyle(.borderless)
        }
    }

    /// The stat card shows when the window's share-based totals are
    /// meaningful for the list below: not for guests (the dashboard
    /// endpoint 403s them, same gating as the dashboard's own fetches) and
    /// not in project scope (the totals are ledger-wide while the list is
    /// project-only — the project's numbers live in its detail view).
    private var showsStats: Bool {
        guard let ledger = ledgerStore.activeLedger else { return false }
        return !ledger.isGuest && scopedProject == nil
    }

    /// The chart page's push payload and the stat card's summary fetch
    /// share the store's live capture (see `JournalStore.statsFilters`).
    private var statsFilters: StatsFilters? {
        store.statsFilters
    }

    /// The month view page's toolbar button (calendar icon, before the
    /// chart button) — the dashboard's entry, re-surfaced here. Ungated
    /// here: the capsule group below owns the non-guest gate (guests 403
    /// the daily-summary report the calendar's days come from).
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

    /// The chart-page button (toolbar, trailing): opens the stats
    /// component on the journal's active window and filters (the funnel
    /// sheet's structural picks; the search text and the show/hide opt-out
    /// toggle stay list-only). Same gate as the stat card — the report
    /// endpoints 403 guests and the cards' ledger-wide numerals would
    /// misdescribe a project-only list.
    private var statsButton: some View {
        Group {
            if showsStats {
                StatsEntryButton {
                    guard let ledger = ledgerStore.activeLedger else { return }
                    statsTarget = StatsTarget(
                        ledger: ledger,
                        window: statsWindow,
                        filters: statsFilters
                    )
                }
            }
        }
    }

    /// The calendar and stats buttons as ONE trailing capsule with a
    /// hairline divider between them (the shared ToolbarDividerGroup).
    /// The calendar needs any non-guest ledger (the group's gate); the
    /// stats button additionally hides in project scope (showsStats —
    /// the report endpoints 403 guests and the ledger-wide numerals
    /// would misdescribe a project-only list), and the divider follows
    /// that gate so no lone hairline survives a hide.
    @ViewBuilder
    private var calendarStatsGroup: some View {
        if ledgerStore.activeLedger?.isGuest == false {
            ToolbarDividerGroup(showsDivider: showsStats) {
                monthCalendarButton
            } trailing: {
                statsButton
            }
        }
    }

    /// The window the chart page renders: the active bounds normalized to
    /// the `MonthWindow` contract (from = the first day's midnight, to =
    /// the last day's inclusive end — the week/year tabs write midnight
    /// bounds while the month tab and the editors write end-of-day, and
    /// the stats fetches pass `to` through raw). The All tab's nil bounds
    /// mean the entry extent — the range editor's own seed rule — with
    /// the current month as the fallback before the extent loads.
    private var statsWindow: MonthWindow {
        let calendar = Calendar.current
        let from = store.fromDate
            ?? store.entryBounds?.earliest
            ?? AppDates.monthWindow(containing: .now).from
        let to = store.toDate
            ?? store.entryBounds?.latest
            ?? AppDates.monthWindow(containing: .now).to
        return MonthWindow(
            from: calendar.startOfDay(for: from),
            to: AppDates.localEndOfDay(to)
        )
    }

    /// Refetches the window summary, debounced like the list's own reload
    /// so a tab switch's two bound writes cost one request. The filters
    /// ride along live (read at fetch time — the card follows the list),
    /// so a participant- or project-filtered window's totals describe
    /// exactly the rows beneath the card. The All tab's unbounded fetch is
    /// equivalent to bounding by the entry extent (every entry lies within
    /// it), so no bounds wait is needed; a ledger switch that lands
    /// mid-flight discards the stale response.
    private func scheduleSummaryReload() {
        guard showsStats else { return }
        summaryTask?.cancel()
        summaryTask = Task {
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            let ledgerId = ledgerStore.activeLedger?.id
            let summary = await reportStore.windowSummary(
                from: store.fromDate ?? .distantPast,
                to: store.toDate ?? .distantFuture,
                filters: statsFilters
            )
            guard !Task.isCancelled, ledgerId == ledgerStore.activeLedger?.id else { return }
            windowSummary = summary
        }
    }

    /// Projects of the active ledger, from the app-level per-ledger cache —
    /// kept warm by the ledger switcher's own load. Read here only for the
    /// archived-filter drop; the funnel sheet derives its own options.
    private var projectFilterOptions: [QianlaiProject] {
        guard let ledger = ledgerStore.activeLedger else { return [] }
        return appProjectStore.activeProjects(for: ledger.id)
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
    /// sheet can't change it and Clear restores it. The store-side
    /// signature guard (`syncScopeProjection`) is what makes re-running
    /// this from a pop-back `.task` harmless: unchanged inputs leave a
    /// manual project filter alone.
    private func syncScopeFilter() {
        store.syncScopeProjection(
            ledgerId: ledgerStore.activeLedger?.id,
            scopeProjectId: scopedProject?.id
        )
    }

    /// Drops a manual project filter that no longer points at an active
    /// project. Scoped sessions are exempt — the switcher scope owns the
    /// filter there, and the scope guard keeps it active.
    private func dropArchivedProjectFilter() {
        guard store.scopeProjectId == nil,
              let filterId = store.projectFilterId,
              !projectFilterOptions.contains(where: { $0.id == filterId })
        else { return }
        store.projectFilterId = nil
    }
}
