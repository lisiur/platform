//
//  StatsTabPageView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/23.
//

import SwiftUI

/// The stats tab: the journal page's chrome — the same period tabs
/// (Week/Month/Year/All/Range), the same window stepper/range editor, and
/// the same funnel filters (project / counted / participant), all reading
/// the SHARED journal store, so this tab and the journal tab stay in
/// lockstep — window and filters are literally one state — with the entry
/// list replaced by the stats component's cards (overview block, trend
/// chart, composition chart; the calendar card stays on the month view
/// page). The chrome itself is the shared journal filter surface
/// (JournalFilters.swift) — there is one implementation, not a copy. The
/// list-only affordances are gone with the list: the drawer search and
/// the amount-order menu. The toolbar keeps the journal's month-view
/// entry (the chart button would be this page). Drills push the same
/// filtered-journal detail the journal's chart page does, windowed and
/// filtered to what the user tapped.
///
/// The tab is configurable-only, so it never renders in the fixed bar —
/// guests and project scopes can't reach it, and the cards' ledger-wide
/// numerals always describe the plain ledger scope the bar guarantees.
struct StatsTabPageView: View {
    @Environment(LedgerStore.self) private var ledgerStore
    /// The journal tab's own store: one window/filters state across both
    /// surfaces (see the header comment).
    @Environment(JournalStore.self) private var store
    @Environment(ProjectStore.self) private var appProjectStore
    /// The shared post/update/delete epoch: the entry extent refreshes on
    /// it, and the cards re-summarize through their own listener.
    @Environment(ReportStore.self) private var reportStore
    @State private var memberStore = MemberStore()
    /// The shared filter surface's selection state (range pin, opening
    /// default), over the store above.
    @State private var windowModel = JournalWindowModel()
    /// One windowed store for this surface, per the stats component's
    /// per-surface rule — never the dashboard tab's payloads.
    @State private var statsStore = StatsStore()
    /// Push flag for the month view page (the toolbar calendar button,
    /// same as the journal's).
    @State private var isShowingMonthCalendar = false
    /// A card drill's push payload — everything captured at tap time (the
    /// list's bounds and filters keep moving behind a push; the pushed
    /// detail must describe the figures the user tapped on).
    @State private var drillTarget: DrillTarget?

    private struct DrillTarget: Identifiable, Hashable {
        let ledger: QianlaiLedger
        let filter: JournalDrillDown
        let day: Date?
        let window: MonthWindow
        let filters: StatsFilters?

        var id: String {
            let dayKey = day.map { String($0.timeIntervalSince1970) } ?? "-"
            let windowKey = "\(window.from.timeIntervalSince1970)-\(window.to.timeIntervalSince1970)"
            let filterKey = StatsFilters.keySegment(filters) ?? "-"
            return "\(ledger.id)|\(dayKey)|\(filter.accountId ?? "")|\(filter.parentAccountId ?? "")|\(filter.kind?.rawValue ?? "all")|\(windowKey)|\(filterKey)"
        }
    }

    var body: some View {
        Group {
            if ledgerStore.isLoading, ledgerStore.ledgers.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let ledger = ledgerStore.activeLedger {
                statsList(ledger: ledger)
            } else {
                EmptyStateView(
                    message: L10n.string("dashboard.selectLedger", defaultValue: "Select a ledger to get started"),
                    systemImage: "text.book.closed"
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle(Text(L10n.string("stats.title", defaultValue: "Stats")))
        .toolbar {
            #if os(iOS)
            ToolbarItem(placement: .topBarTrailing) {
                monthCalendarButton
            }
            #else
            ToolbarItem(placement: .primaryAction) {
                monthCalendarButton
            }
            #endif
        }
        .navigationDestination(item: $drillTarget) { target in
            StatKindDetailView(
                ledger: target.ledger,
                filter: target.filter,
                window: target.window,
                day: target.day,
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
        }
        // The scope can change while this tab stays alive (the quick-entry
        // sheet's switcher) — follow it exactly like the journal does.
        .onChange(of: scopedProject?.id) {
            syncScopeFilter()
        }
        // A project flipping to archived elsewhere must not leave its id
        // as a silent filter (the picker would render a blank row).
        .onChange(of: projectFilterOptions.map(\.id)) {
            dropArchivedProjectFilter()
        }
        // An emptied window ends a range pin, like the journal's.
        .onChange(of: store.fromDate) {
            windowModel.clearRangePinIfWindowEmpty(in: store)
        }
        .onChange(of: store.toDate) {
            windowModel.clearRangePinIfWindowEmpty(in: store)
        }
        // A post/update/delete anywhere: the extent follows; the cards
        // re-summarize on the same bump through the component's own
        // listener.
        .onChange(of: reportStore.journalEpoch) {
            store.refreshBounds()
        }
        // The page's own data only: the cards refetch, and the extent (the
        // All tab's bounds) refreshes — the shared store's entry LIST is
        // not this page's to reload.
        .refreshable {
            guard let id = ledgerStore.activeLedger?.id else { return }
            store.refreshBounds()
            await statsStore.load(
                ledgerId: id,
                window: statsWindow,
                filters: statsFilters
            )
        }
    }

    /// The page body: the period/window/filter header, then the cards.
    /// Both rows are chrome-free (clear background, no separators, no
    /// insets — horizontal margins come from the inset-grouped list) and
    /// carry the dashboard summary's vertical 8pt, which keeps iOS 26's
    /// section corner mask off the cards' rims.
    private func statsList(ledger: QianlaiLedger) -> some View {
        List {
            VStack(alignment: .leading, spacing: 16) {
                JournalPeriodTabs(store: store, model: windowModel)
                HStack(spacing: 8) {
                    JournalWindowControl(store: store, model: windowModel)
                    Spacer()
                    JournalFilterButton(
                        store: store,
                        ledgerStore: ledgerStore,
                        projectStore: appProjectStore,
                        memberStore: memberStore
                    )
                }
                .padding(.horizontal, 6)
            }
            .padding(.vertical, 8)
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())
            StatsCardsView(
                store: statsStore,
                ledgerId: ledger.id,
                currency: ledger.currency,
                isReportingEnabled: !ledger.isGuest,
                showsCalendar: false,
                window: statsWindow,
                filters: statsFilters,
                expenseAction: { openDrill(JournalDrillDown(kind: .expense)) },
                incomeAction: { openDrill(JournalDrillDown(kind: .income)) },
                onSelectDay: { day, kind in openDrill(JournalDrillDown(kind: kind), day: day) },
                onSelectCategory: { openDrill($0) }
            )
            .padding(.vertical, 8)
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())
        }
        .appBackgroundSink()
    }

    /// The month view page's toolbar button — the journal's entry,
    /// guest-gated the same way (the page's per-day amounts come from the
    /// daily-summary report whose endpoint 403s guests).
    @ViewBuilder
    private var monthCalendarButton: some View {
        if ledgerStore.activeLedger?.isGuest == false {
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
    }

    // MARK: - Scope & filter upkeep (ledger-scope semantics, host-side)

    /// Projects of the active ledger, from the app-level per-ledger cache —
    /// kept warm by the ledger switcher's own load. Read here only for the
    /// archived-filter drop; the funnel sheet derives its own options.
    private var projectFilterOptions: [QianlaiProject] {
        guard let ledger = ledgerStore.activeLedger else { return [] }
        return appProjectStore.activeProjects(for: ledger.id)
    }

    private var scopedProject: QianlaiProject? {
        guard let ledger = ledgerStore.activeLedger else { return nil }
        return appProjectStore.scopedProject(in: ledger.id, isGuestLedger: ledger.isGuest)
    }

    private func syncScopeFilter() {
        store.syncScopeProjection(
            ledgerId: ledgerStore.activeLedger?.id,
            scopeProjectId: scopedProject?.id
        )
    }

    private func dropArchivedProjectFilter() {
        guard store.scopeProjectId == nil,
              let filterId = store.projectFilterId,
              !projectFilterOptions.contains(where: { $0.id == filterId })
        else { return }
        store.projectFilterId = nil
    }

    // MARK: - Cards

    /// The structural filters as they read right now (the journal's live
    /// capture): empty collapses to nil so an unfiltered surface stays
    /// wire- and cache-identical to the dashboard's.
    private var statsFilters: StatsFilters? {
        let filters = StatsFilters(
            participantUserId: store.participantUserId,
            projectId: store.projectFilterId
        )
        return filters.isEmpty ? nil : filters
    }

    /// The window the cards summarize: the active bounds normalized to the
    /// `MonthWindow` contract, the All tab's nil bounds meaning the entry
    /// extent with the current month as fallback — the journal's
    /// `statsWindow` rule verbatim.
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

    private func openDrill(_ filter: JournalDrillDown, day: Date? = nil) {
        guard let ledger = ledgerStore.activeLedger else { return }
        drillTarget = DrillTarget(
            ledger: ledger,
            filter: filter,
            day: day,
            window: statsWindow,
            filters: statsFilters
        )
    }
}
