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
/// dashboard is this page pinned to a month.
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
    @Environment(\.locale) private var locale
    @State private var memberStore = MemberStore()
    @State private var isFilterPresented = false
    /// True while the user has explicitly chosen the range tab — keeps the
    /// selection from re-deriving to a preset tab when the picked bounds
    /// happen to form an exact week/month/year window. Cleared by tapping
    /// any other tab, and by the window itself emptying (the funnel sheet's
    /// Clear lands on All the same way); nil bounds still fall through to
    /// All.
    @State private var isRangePinned = false
    /// Share-based totals for the current window (the stat card), fetched
    /// one-shot per window change — never the shared dashboard-cards state.
    @State private var windowSummary: Dashboard?
    @State private var summaryTask: Task<Void, Never>?

    var body: some View {
        Group {
            if ledgerStore.isLoading, ledgerStore.ledgers.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let ledger = ledgerStore.activeLedger {
                EntryListView(
                    ledger: ledger,
                    emptyMessage: L10n.string("journal.empty", defaultValue: "No entries yet"),
                    topContent: AnyView(rangeHeader)
                )
            } else {
                EmptyStateView(
                    message: L10n.string("dashboard.selectLedger", defaultValue: "Select a ledger to get started"),
                    systemImage: "book"
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle(Text(L10n.string("journal.title", defaultValue: "Journal")))
        .task(id: ledgerStore.activeLedger?.id) {
            guard let id = ledgerStore.activeLedger?.id else { return }
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
        // Window changes refetch the stat card, debounced like the list;
        // an emptied window (the funnel sheet's Clear) also ends a range
        // pin — its seeded range no longer exists.
        .onChange(of: store.fromDate) {
            clearRangePinIfWindowEmpty()
            scheduleSummaryReload()
        }
        .onChange(of: store.toDate) {
            clearRangePinIfWindowEmpty()
            scheduleSummaryReload()
        }
        // A post/update/delete anywhere bumps this; the All tab's entry
        // extent and the card's window totals must move with the list.
        .onChange(of: reportStore.journalEpoch) {
            store.refreshBounds()
            scheduleSummaryReload()
        }
        // Auto-collapsing drawer search (the dashboard's): hidden until the
        // list is pulled down, expands over the title while focused. Bound
        // straight to the store — its 200ms coalescing reload is the
        // debounce, and the filter sheet's Clear updates the field for free.
        #if os(iOS)
        .searchable(
            text: Binding(
                get: { store.searchQuery },
                set: { store.searchQuery = $0 }
            ),
            placement: .navigationBarDrawer(displayMode: .automatic),
            prompt: Text(L10n.string("journal.search.placeholder", defaultValue: "Search…"))
        )
        #else
        .searchable(
            text: Binding(
                get: { store.searchQuery },
                set: { store.searchQuery = $0 }
            ),
            prompt: Text(L10n.string("journal.search.placeholder", defaultValue: "Search…"))
        )
        #endif
        .refreshable {
            await store.reload()
        }
    }

    /// The time window of the list, as an inline tab. The tab always
    /// derives from the store's bounds — every path that writes them
    /// (tabs, steppers, range pickers, the funnel sheet's Clear) lands the
    /// selection back on the right tab without extra state.
    private enum TimeTab: Hashable {
        case week, month, year, all, range
    }

    /// Whether the filters the funnel sheet owns are active — the project
    /// pick, the counted/excluded choice, or the participant pick. The date
    /// window and search live outside this sheet and signal through the
    /// tab bar and search field instead.
    private var hasListFilters: Bool {
        store.participantMemberId != nil
            || store.projectFilterId != store.scopeProjectId
            || !store.includeExcluded
    }

    /// The active tab: nil bounds are All; the range tab is pinned while
    /// chosen — its own seed is a full month, and hand-picked bounds can
    /// legitimately land on exact week/month/year windows, none of which
    /// should yank the selection back to a preset tab; otherwise bounds
    /// covering one locale-defined week or matching a calendar month/year
    /// map to its tab, and a custom or one-sided window is the range
    /// editor.
    private var timeTab: TimeTab {
        switch (store.fromDate, store.toDate) {
        case (nil, nil):
            return .all
        case (let from?, let to?):
            if isRangePinned { return .range }
            if isWeekWindow(from, to) { return .week }
            switch DateRangeMode.preset(from: from, to: to) {
            case .month: return .month
            case .year: return .year
            default: return .range
            }
        default:
            return .range
        }
    }

    private var timeTabBinding: Binding<TimeTab> {
        Binding(
            get: { timeTab },
            set: { newTab in
                guard newTab != timeTab else { return }
                isRangePinned = newTab == .range
                switch newTab {
                case .week:
                    setWeekWindow(containing: .now)
                case .month:
                    setMonthWindow(containing: .now)
                case .year:
                    setYearWindow(containing: .now)
                case .all:
                    // Direct bound writes like the other tabs: setWindow
                    // suppresses the didSets, leaving the list on the old
                    // window's data until some other trigger refetches.
                    store.fromDate = nil
                    store.toDate = nil
                case .range:
                    // Inherit the currently active range: a preset tab's
                    // window is already in the bounds and is kept as-is;
                    // coming from All (nil bounds) the editor starts from
                    // the entry extent, falling back to the current month
                    // before that extent has loaded.
                    if store.fromDate == nil, store.toDate == nil {
                        if let bounds = store.entryBounds {
                            store.fromDate = bounds.earliest
                            store.toDate = bounds.latest
                        } else {
                            setMonthWindow(containing: .now)
                        }
                    }
                }
            }
        )
    }

    /// An emptied window (the funnel sheet's Clear, or any non-tab path
    /// landing on All) ends a range pin: the pin guards the range editor's
    /// own window, which no longer exists — the next hand-pick re-derives
    /// its tab fresh instead of staying pinned to Range.
    private func clearRangePinIfWindowEmpty() {
        if store.fromDate == nil, store.toDate == nil { isRangePinned = false }
    }

    /// Whether the bounds exactly cover one locale-defined week (the
    /// writer below lays them down as the week interval's start plus the
    /// interval's last midnight).
    private func isWeekWindow(_ from: Date, _ to: Date) -> Bool {
        let calendar = Calendar.current
        guard let interval = calendar.dateInterval(of: .weekOfYear, for: from),
              let inclusiveEnd = calendar.date(byAdding: .day, value: -1, to: interval.end)
        else { return false }
        return calendar.isDate(interval.start, inSameDayAs: from)
            && calendar.isDate(inclusiveEnd, inSameDayAs: to)
    }

    /// Inclusive week window per the viewer's calendar settings (first
    /// weekday follows the locale).
    private func setWeekWindow(containing date: Date) {
        let calendar = Calendar.current
        guard let interval = calendar.dateInterval(of: .weekOfYear, for: date) else { return }
        store.fromDate = interval.start
        store.toDate = calendar.date(byAdding: .day, value: -1, to: interval.end) ?? interval.start
    }

    private func setMonthWindow(containing date: Date) {
        let window = AppDates.monthWindow(containing: date)
        store.fromDate = window.from
        store.toDate = window.to
    }

    private func setYearWindow(containing date: Date) {
        let calendar = Calendar.current
        guard let interval = calendar.dateInterval(of: .year, for: date) else { return }
        store.fromDate = interval.start
        store.toDate = calendar.date(byAdding: .day, value: -1, to: interval.end) ?? interval.start
    }

    /// The window control on the control row's leading edge: a chevron
    /// stepper for the preset tabs (the dashboard month-header pattern,
    /// capped at the present), and the shared from/to editor for Range —
    /// seeded with the range active at switch time — and for All, which
    /// shows the ledger's entry extent.
    @ViewBuilder
    private var windowControl: some View {
        switch timeTab {
        case .week:
            let calendar = Calendar.current
            let start = calendar.dateInterval(of: .weekOfYear, for: store.fromDate ?? .now)?.start
                ?? calendar.startOfDay(for: .now)
            let currentStart = calendar.dateInterval(of: .weekOfYear, for: .now)?.start
                ?? calendar.startOfDay(for: .now)
            stepperRow(
                title: AppDates.formatWeekTitle(
                    start: start,
                    end: calendar.date(byAdding: .day, value: 6, to: start) ?? start,
                    locale: locale
                ),
                canStepForward: start < currentStart,
                step: { direction in
                    setWeekWindow(containing: calendar.date(byAdding: .day, value: 7 * direction, to: start) ?? start)
                }
            )
        case .month:
            let calendar = Calendar.current
            let components = calendar.dateComponents([.year, .month], from: store.fromDate ?? .now)
            let month = YearMonth(year: components.year ?? 1970, month: components.month ?? 1)
            stepperRow(
                title: AppDates.formatMonthTitle(month, locale: locale),
                canStepForward: month < .current,
                step: { direction in
                    setMonthWindow(containing: (direction < 0 ? month.previous : month.next).start)
                }
            )
        case .year:
            let calendar = Calendar.current
            let year = calendar.component(.year, from: store.fromDate ?? .now)
            stepperRow(
                title: String(year),
                canStepForward: year < calendar.component(.year, from: .now),
                step: { direction in
                    if let target = calendar.date(from: DateComponents(year: year + direction, month: 1, day: 1)) {
                        setYearWindow(containing: target)
                    }
                }
            )
        case .all, .range:
            windowFields
        }
    }

    /// One chevron-stepped window: arrows hugging the title, like the
    /// dashboard's month header. Backward stepping is always allowed; the
    /// caller caps forward at the present.
    private func stepperRow(
        title: String,
        canStepForward: Bool,
        step: @escaping (Int) -> Void
    ) -> some View {
        HStack(spacing: 8) {
            Button { step(-1) } label: {
                CircleIcon(systemName: "chevron.left")
            }
            // Borderless: with the default style a tap on the List row
            // fires BOTH chevrons, canceling each other out.
            .buttonStyle(.borderless)
            Text(title)
                .font(.title3.weight(.semibold))
            Button { step(1) } label: {
                CircleIcon(systemName: "chevron.right")
            }
            .buttonStyle(.borderless)
            .disabled(!canStepForward)
        }
    }

    /// The shared from/to editors — two plain yyyy/MM/dd fields bound
    /// straight to the store (the reload debounce coalesces the two
    /// writes). An unset side displays its sibling or today until touched;
    /// on All the bindings already substitute the entry extent, so the
    /// unset fallback there is plain today. Editing past a preset window
    /// re-derives the tab to Range.
    private var windowFields: some View {
        HStack(spacing: 8) {
            RangeDateField(
                a11yLabel: L10n.string("filters.from", defaultValue: "From"),
                date: fromFieldBinding,
                fallback: timeTab == .all ? .now : (store.toDate ?? .now)
            )
            Text(verbatim: "–")
                .foregroundStyle(.tertiary)
            RangeDateField(
                a11yLabel: L10n.string("filters.to", defaultValue: "To"),
                date: toFieldBinding,
                fallback: timeTab == .all ? .now : (store.fromDate ?? .now)
            )
        }
    }

    /// On a preset tab the field shows the tab's written bound; on All —
    /// whose filter bounds stay nil — it shows the ledger's entry extent.
    /// Picking either way writes a real bound, which re-derives the tab.
    private var fromFieldBinding: Binding<Date?> {
        Binding(
            get: { store.fromDate ?? (timeTab == .all ? store.entryBounds?.earliest : nil) },
            set: { store.fromDate = $0 }
        )
    }

    private var toFieldBinding: Binding<Date?> {
        Binding(
            get: { store.toDate ?? (timeTab == .all ? store.entryBounds?.latest : nil) },
            set: { store.toDate = $0 }
        )
    }

    /// The scrolling first row (dashboard month-summary layout): the
    /// time-window tabs, then a control row carrying the window stepper or
    /// range pickers on the leading edge and the filter/sort buttons
    /// trailing — the dashboard month header's arrangement. Horizontal
    /// margins come from the inset-grouped list itself; the small extra
    /// inset hugs the controls like the dashboard's.
    private var rangeHeader: some View {
        VStack(alignment: .leading, spacing: 16) {
            Picker(
                L10n.string("filters.period", defaultValue: "Period"),
                selection: timeTabBinding
            ) {
                Text(L10n.string("filters.week", defaultValue: "Week")).tag(TimeTab.week)
                Text(L10n.string("filters.month", defaultValue: "Month")).tag(TimeTab.month)
                Text(L10n.string("filters.year", defaultValue: "Year")).tag(TimeTab.year)
                Text(L10n.string("filters.all", defaultValue: "All")).tag(TimeTab.all)
                Text(L10n.string("filters.range", defaultValue: "Range")).tag(TimeTab.range)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding(.horizontal, 6)
            HStack(spacing: 8) {
                windowControl
                Spacer()
                filterButton
                sortMenu
                    .buttonStyle(.borderless)
            }
            .padding(.horizontal, 6)
            if showsStats {
                StatSummaryBlock(
                    month: windowSummary?.month,
                    currency: ledgerStore.activeLedger?.currency
                )
            }
        }
        .padding(.vertical, 8)
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

    /// Refetches the window summary, debounced like the list's own reload
    /// so a tab switch's two bound writes cost one request. The All tab's
    /// unbounded fetch is equivalent to bounding by the entry extent (every
    /// entry lies within it), so no bounds wait is needed; a ledger switch
    /// that lands mid-flight discards the stale response.
    private func scheduleSummaryReload() {
        guard showsStats else { return }
        summaryTask?.cancel()
        summaryTask = Task {
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            let ledgerId = ledgerStore.activeLedger?.id
            let summary = await reportStore.windowSummary(
                from: store.fromDate ?? .distantPast,
                to: store.toDate ?? .distantFuture
            )
            guard !Task.isCancelled, ledgerId == ledgerStore.activeLedger?.id else { return }
            windowSummary = summary
        }
    }

    /// Amount-order menu, beside the filter button — same items, checkmark
    /// and tint signal as the dashboard's month header (the default order
    /// never carries the checkmark; a non-default sort tints the icon
    /// accent and gets marked). Presentation intent, not a filter: it never
    /// tints the funnel.
    private var sortMenu: some View {
        Menu {
            sortMenuItem(.date, title: L10n.string("journal.sortDefault", defaultValue: "Default"))
            sortMenuItem(
                .amountDescending,
                title: L10n.string("journal.sortAmountDesc", defaultValue: "Amount: high to low")
            )
            sortMenuItem(
                .amountAscending,
                title: L10n.string("journal.sortAmountAsc", defaultValue: "Amount: low to high")
            )
        } label: {
            CircleIcon(systemName: "arrow.up.arrow.down", isActive: store.sort != .date)
        }
        .accessibilityLabel(Text(L10n.string("journal.sort", defaultValue: "Sort")))
    }

    private func sortMenuItem(_ sort: JournalStore.EntrySort, title: String) -> some View {
        Button {
            store.sort = sort
        } label: {
            if store.sort == sort, sort != .date {
                Label(title, systemImage: "checkmark")
            } else {
                Text(title)
            }
        }
    }

    private var filterButton: some View {
        Button {
            isFilterPresented = true
        } label: {
            CircleIcon(systemName: "line.3.horizontal.decrease", isActive: hasListFilters)
        }
        .buttonStyle(.borderless)
        .accessibilityLabel(Text(L10n.string("journal.filter", defaultValue: "Filter")))
        .sheet(isPresented: $isFilterPresented) {
            filterSheet
        }
    }

    /// The remaining entry filters (everything except the date window and
    /// search), live-bound to the store — a picker change reloads at once,
    /// Done merely dismisses.
    private var filterSheet: some View {
        NavigationStack {
            Form {
                if !ledgerProjects.isEmpty {
                    Section {
                        Picker(
                            L10n.string("journal.filterProject", defaultValue: "Project"),
                            selection: Binding(
                                get: { store.projectFilterId ?? "" },
                                set: { store.projectFilterId = $0.isEmpty ? nil : $0 }
                            )
                        ) {
                            Text(L10n.string("journal.filterAllProjects", defaultValue: "All Projects")).tag("")
                            ForEach(ledgerProjects) { project in
                                Text(project.name).tag(project.id)
                            }
                        }
                        // The switcher's scope owns the project while one is
                        // active — the picker stays visible so the scope is
                        // discoverable, but can't be changed here.
                        .disabled(scopedProject != nil)
                    } footer: {
                        if scopedProject != nil {
                            Text(L10n.string(
                                "journal.project.scopeFooter",
                                defaultValue: "The journal is scoped to this project. Change the project from the ledger switcher."
                            ))
                        }
                    }
                }
                // Ledger-wide scope only: a project filter always shows every
                // entry of that project, so the flag choice would be a no-op.
                if store.projectFilterId == nil {
                    Section {
                        Picker(
                            L10n.string("journal.filterShow", defaultValue: "Show"),
                            selection: Binding(
                                get: { store.includeExcluded ? "all" : "counted" },
                                set: { store.includeExcluded = $0 == "all" }
                            )
                        ) {
                            Text(L10n.string("journal.show.counted", defaultValue: "Counted in Income & Expense")).tag("counted")
                            Text(L10n.string("journal.show.all", defaultValue: "All Entries")).tag("all")
                        }
                    }
                }
                if !participantCandidates.isEmpty {
                    Section {
                        Picker(
                            L10n.string("journal.filterParticipant", defaultValue: "Participant"),
                            selection: Binding(
                                get: { store.participantMemberId ?? "" },
                                set: { store.participantMemberId = $0.isEmpty ? nil : $0 }
                            )
                        ) {
                            Text(L10n.string("journal.filterAllMembers", defaultValue: "All Members")).tag("")
                            ForEach(participantCandidates) { member in
                                Text(member.displayName).tag(member.id)
                            }
                        }
                    }
                }
            }
            .navigationTitle(Text(L10n.string("filters.title", defaultValue: "Filters")))
            .inlineNavigationBarTitle()
            .toolbar {
                if hasListFilters {
                    ToolbarItem(placement: .cancellationAction) {
                        // The page-wide reset: besides this sheet's picks it
                        // also lifts the header's date range and the search
                        // field (store.clearFilters).
                        Button(role: .destructive) {
                            store.clearFilters()
                            isFilterPresented = false
                        } label: {
                            Text(L10n.string("filters.clear", defaultValue: "Clear"))
                        }
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.string("common.done", defaultValue: "Done")) {
                        isFilterPresented = false
                    }
                }
            }
        }
        #if os(iOS)
        .presentationDetents([.medium, .large])
        #endif
    }

    /// Projects of the active ledger, from the app-level per-ledger cache —
    /// kept warm by the ledger switcher's own load.
    private var ledgerProjects: [QianlaiProject] {
        guard let ledger = ledgerStore.activeLedger else { return [] }
        return appProjectStore.projects(for: ledger.id)
    }

    /// Participant filter options, scoped to the active project filter when
    /// one is set — a project's entries can only be tagged with that
    /// project's members, including outsiders who hold no roster row.
    /// Falls back to the full ledger roster otherwise.
    private var participantCandidates: [EntryPerson] {
        if let projectId = store.projectFilterId,
           let project = ledgerProjects.first(where: { $0.id == projectId }) {
            return project.members.map(\.entryPerson)
        }
        return memberStore.members.map(\.entryPerson)
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
    /// sheet can't change it and Clear restores it.
    private func syncScopeFilter() {
        let scopedId = scopedProject?.id
        if store.scopeProjectId != scopedId { store.scopeProjectId = scopedId }
        if store.projectFilterId != scopedId {
            store.projectFilterId = scopedId
        }
    }
}

/// One range endpoint: a plain yyyy/MM/dd field that opens the system
/// graphical calendar in a small popover (a compact sheet on iPhone). The
/// compact DatePicker was bypassed because its chrome carries quick-step
/// arrows and renders the date in the locale's own format — this field
/// keeps both ends fixed to one numeric format.
private struct RangeDateField: View {
    let a11yLabel: String
    /// The bound endpoint; nil until the user picks one.
    @Binding var date: Date?
    /// Displayed (and edited from) until the endpoint is set.
    let fallback: Date

    @State private var isPicking = false

    var body: some View {
        Button {
            isPicking = true
        } label: {
            Text(displayText)
                .font(.subheadline.monospacedDigit())
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                // The two range fields split the control row's remaining
                // width; the trailing filter/sort buttons stay fixed.
                .frame(maxWidth: .infinity)
                .background(Capsule().fill(Color.primary.opacity(0.06)))
        }
        // Borderless: with the default style a tap on the List row fires
        // the row underneath too.
        .buttonStyle(.borderless)
        .accessibilityLabel(Text("\(a11yLabel) \(displayText)"))
        .popover(isPresented: $isPicking) {
            DatePicker(
                "",
                selection: Binding(
                    get: { date ?? fallback },
                    set: { date = $0 }
                ),
                displayedComponents: .date
            )
            .datePickerStyle(.graphical)
            .labelsHidden()
            .padding()
            #if os(iOS)
            .presentationDetents([.height(400)])
            #endif
        }
    }

    /// Fixed numeric format (the app's design decision, not the locale's):
    /// a zero-padded "yyyy/MM/dd" identical on both ends.
    private var displayText: String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy/MM/dd"
        return formatter.string(from: date ?? fallback)
    }
}
