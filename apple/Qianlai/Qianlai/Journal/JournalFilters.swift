//
//  JournalFilters.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/23.
//

import SwiftUI

/// The journal filter surface, shared by every page that filters a
/// ledger's entries the journal way: the period tabs (Week/Month/Year/
/// All/Range), the window stepper/range editor, the funnel button
/// opening the structural-filter sheet (project / not-counted /
/// participant), and the amount-order menu beside it. The journal tab
/// and the stats tab mount the identical set; a future surface mounts
/// the same — extract here instead of copying again.
///
/// Shape: `JournalWindowModel` owns the selection-side state (the range
/// pin and the once-per-session default), reading and writing the window
/// bounds on a `JournalStore` — the store stays the state owner, so its
/// didSet reload behavior and its filters keep working exactly as before.
/// The date math under it is pure and static, unit-tested without a
/// store. The views are presentational consumers: they take the stores
/// they read as parameters (the funnel button additionally needs a
/// host-owned `MemberStore` for the participant picker) and never fetch.
/// The scope projection (`syncScopeProjection`) and the archived-project
/// filter drop stay host-side — they are ledger-scope semantics, not
/// filter mechanics.

/// Which period preset the window bounds currently shape — the segmented
/// tab's selection, derived from the store's bounds (never stored).
enum JournalTimeTab: Hashable {
    case week, month, year, all, range
}

/// The journal window's selection-side state and transitions. One
/// instance per mounted surface (`@State`), operating on whatever
/// `JournalStore` the host renders from.
@MainActor
@Observable
final class JournalWindowModel {
    /// True while the user has explicitly chosen the range tab — keeps
    /// the selection from re-deriving to a preset tab when the picked
    /// bounds happen to form an exact week/month/year window. Cleared by
    /// tapping any other tab, and by the window itself emptying (the
    /// funnel sheet's Clear lands on All the same way); nil bounds still
    /// fall through to All.
    private(set) var isRangePinned = false

    /// Whether the session's opening default has landed: the page opens
    /// on the current week, applied once on the first real load — the
    /// window then belongs to the user, so an explicit All/range choice
    /// survives later appearances and ledger switches the same way any
    /// picked window does.
    private(set) var hasAppliedDefaultWindow = false

    /// The active tab for the store's current bounds. nil bounds are All;
    /// a pinned range stays Range; bounds covering one locale-defined
    /// week or matching a calendar month/year map to its tab; a custom or
    /// one-sided window is the range editor.
    func timeTab(in store: JournalStore) -> JournalTimeTab {
        Self.timeTab(from: store.fromDate, to: store.toDate, isRangePinned: isRangePinned)
    }

    /// Pure tab derivation — the unit-tested core of the model.
    nonisolated static func timeTab(
        from: Date?, to: Date?, isRangePinned: Bool
    ) -> JournalTimeTab {
        switch (from, to) {
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

    /// The tab picker's binding: reads `timeTab(in:)`, writes `select(_:in:)`.
    func binding(in store: JournalStore) -> Binding<JournalTimeTab> {
        Binding(
            get: { self.timeTab(in: store) },
            set: { self.select($0, in: store) }
        )
    }

    /// A tab tap: lands the window the tab names. Direct bound writes
    /// (like every path here) leave the list on the old window's data
    /// until some other trigger refetches — the store's didSet debounced
    /// reload owns the fetch, exactly as before the extraction.
    func select(_ tab: JournalTimeTab, in store: JournalStore) {
        guard tab != timeTab(in: store) else { return }
        isRangePinned = tab == .range
        switch tab {
        case .week:
            setWeekWindow(containing: .now, in: store)
        case .month:
            setMonthWindow(containing: .now, in: store)
        case .year:
            setYearWindow(containing: .now, in: store)
        case .all:
            store.fromDate = nil
            store.toDate = nil
        case .range:
            // Inherit the currently active range: a preset tab's window
            // is already in the bounds and is kept as-is; coming from All
            // (nil bounds) the editor starts from the entry extent,
            // falling back to the current month before that extent has
            // loaded.
            if store.fromDate == nil, store.toDate == nil {
                if let bounds = store.entryBounds {
                    store.fromDate = bounds.earliest
                    store.toDate = bounds.latest
                } else {
                    setMonthWindow(containing: .now, in: store)
                }
            }
        }
    }

    /// The opening window, written once per session before the first
    /// load: the current week — the same writer a Week tap uses, so the
    /// tab derives and the list fetches on it like any tab switch. A
    /// window that already exists (a deep link that preset one) wins.
    func applyDefaultWindowOnce(in store: JournalStore) {
        guard !hasAppliedDefaultWindow else { return }
        hasAppliedDefaultWindow = true
        guard store.fromDate == nil, store.toDate == nil else { return }
        setWeekWindow(containing: .now, in: store)
    }

    /// An emptied window (the funnel sheet's Clear, or any non-tab path
    /// landing on All) ends a range pin: the pin guards the range
    /// editor's own window, which no longer exists — the next hand-pick
    /// re-derives its tab fresh instead of staying pinned to Range.
    func clearRangePinIfWindowEmpty(in store: JournalStore) {
        if store.fromDate == nil, store.toDate == nil { isRangePinned = false }
    }

    // MARK: - Window writers

    private func setWeekWindow(containing date: Date, in store: JournalStore) {
        let window = Self.weekWindow(containing: date)
        store.fromDate = window.from
        store.toDate = window.to
    }

    private func setMonthWindow(containing date: Date, in store: JournalStore) {
        let window = AppDates.monthWindow(containing: date)
        store.fromDate = window.from
        store.toDate = window.to
    }

    private func setYearWindow(containing date: Date, in store: JournalStore) {
        let window = Self.yearWindow(containing: date)
        store.fromDate = window.from
        store.toDate = window.to
    }

    /// Inclusive week window per the viewer's calendar settings (first
    /// weekday follows the locale): the week interval's start plus the
    /// interval's last midnight.
    nonisolated static func weekWindow(containing date: Date) -> (from: Date, to: Date) {
        let calendar = Calendar.current
        guard let interval = calendar.dateInterval(of: .weekOfYear, for: date) else {
            let day = calendar.startOfDay(for: date)
            return (day, day)
        }
        return (
            interval.start,
            calendar.date(byAdding: .day, value: -1, to: interval.end) ?? interval.start
        )
    }

    /// Inclusive calendar-year window (Jan 1 midnight through Dec 31 end
    /// of day).
    nonisolated static func yearWindow(containing date: Date) -> (from: Date, to: Date) {
        let calendar = Calendar.current
        guard let interval = calendar.dateInterval(of: .year, for: date) else {
            let day = calendar.startOfDay(for: date)
            return (day, day)
        }
        return (
            interval.start,
            calendar.date(byAdding: .day, value: -1, to: interval.end) ?? interval.start
        )
    }

    /// Whether the bounds exactly cover one locale-defined week (the
    /// writer above lays them down as the week interval's start plus the
    /// interval's last midnight).
    nonisolated private static func isWeekWindow(_ from: Date, _ to: Date) -> Bool {
        let calendar = Calendar.current
        guard let interval = calendar.dateInterval(of: .weekOfYear, for: from),
              let inclusiveEnd = calendar.date(byAdding: .day, value: -1, to: interval.end)
        else { return false }
        return calendar.isDate(interval.start, inSameDayAs: from)
            && calendar.isDate(inclusiveEnd, inSameDayAs: to)
    }
}

/// The period tabs: one segmented picker bound through the window model.
/// The tab always derives from the store's bounds — every path that
/// writes them (tabs, steppers, range pickers, the funnel sheet's Clear)
/// lands the selection back on the right tab without extra state.
struct JournalPeriodTabs: View {
    let store: JournalStore
    let model: JournalWindowModel

    var body: some View {
        Picker(
            L10n.string("filters.period", defaultValue: "Period"),
            selection: model.binding(in: store)
        ) {
            Text(L10n.string("filters.week", defaultValue: "Week")).tag(JournalTimeTab.week)
            Text(L10n.string("filters.month", defaultValue: "Month")).tag(JournalTimeTab.month)
            Text(L10n.string("filters.year", defaultValue: "Year")).tag(JournalTimeTab.year)
            Text(L10n.string("filters.all", defaultValue: "All")).tag(JournalTimeTab.all)
            Text(L10n.string("filters.range", defaultValue: "Range")).tag(JournalTimeTab.range)
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .padding(.horizontal, 6)
    }
}

/// The window control on the header row's leading edge: a chevron
/// stepper for the preset tabs (the dashboard month-header pattern,
/// capped at the present), and the shared from/to editor for Range —
/// seeded with the range active at switch time — and for All, which
/// shows the ledger's entry extent.
struct JournalWindowControl: View {
    let store: JournalStore
    let model: JournalWindowModel
    @Environment(\.locale) private var locale

    var body: some View {
        switch model.timeTab(in: store) {
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
                    let window = JournalWindowModel.weekWindow(
                        containing: calendar.date(byAdding: .day, value: 7 * direction, to: start) ?? start
                    )
                    store.fromDate = window.from
                    store.toDate = window.to
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
                    let window = AppDates.monthWindow(
                        containing: (direction < 0 ? month.previous : month.next).start
                    )
                    store.fromDate = window.from
                    store.toDate = window.to
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
                        let window = JournalWindowModel.yearWindow(containing: target)
                        store.fromDate = window.from
                        store.toDate = window.to
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
                fallback: model.timeTab(in: store) == .all ? .now : (store.toDate ?? .now)
            )
            Text(verbatim: "–")
                .foregroundStyle(.tertiary)
            RangeDateField(
                a11yLabel: L10n.string("filters.to", defaultValue: "To"),
                date: toFieldBinding,
                fallback: model.timeTab(in: store) == .all ? .now : (store.fromDate ?? .now)
            )
        }
    }

    /// On a preset tab the field shows the tab's written bound; on All —
    /// whose filter bounds stay nil — it shows the ledger's entry extent.
    /// Picking either way writes a real bound, which re-derives the tab.
    private var fromFieldBinding: Binding<Date?> {
        Binding(
            get: {
                store.fromDate
                    ?? (model.timeTab(in: store) == .all ? store.entryBounds?.earliest : nil)
            },
            set: { store.fromDate = $0 }
        )
    }

    private var toFieldBinding: Binding<Date?> {
        Binding(
            get: {
                store.toDate
                    ?? (model.timeTab(in: store) == .all ? store.entryBounds?.latest : nil)
            },
            set: { store.toDate = $0 }
        )
    }
}

/// The funnel: the filter button (tinted while any structural filter is
/// active) and the sheet it opens — the project pick, the not-counted
/// toggle, and the participant pick, all live-bound to the store (a
/// control change reloads at once; Done merely dismisses). The option
/// lists derive from the injected stores; the member roster is
/// host-owned (`MemberStore`) because the host already loads it for its
/// own lifetime. The window and search live outside this sheet and
/// signal through the tab bar and the stepper instead.
struct JournalFilterButton: View {
    let store: JournalStore
    let ledgerStore: LedgerStore
    let projectStore: ProjectStore
    let memberStore: MemberStore
    /// The Clear button's action. nil (the journal default) runs the
    /// page-wide reset — `store.clearFilters()` also lifts the header's
    /// date range and the search field. A surface whose window is the
    /// page's identity rather than a user selection (the dashboard's
    /// pinned current month) passes its own: clear the sheet's three
    /// picks only (`clearStructuralFilters`), so clearing can never
    /// unpin the page.
    var clearAction: (() -> Void)? = nil

    @State private var isPresented = false

    var body: some View {
        Button {
            isPresented = true
        } label: {
            CircleIcon(systemName: "line.3.horizontal.decrease", isActive: hasListFilters)
        }
        .buttonStyle(.borderless)
        .accessibilityLabel(Text(L10n.string("journal.filter", defaultValue: "Filter")))
        .sheet(isPresented: $isPresented) {
            filterSheet
        }
    }

    /// Whether the structural filters are active — the project pick, the
    /// not-counted toggle (on = isolating 不计收支), the budget toggle
    /// (on = isolating 不计入日常预算), the kind pick, or the participant
    /// pick. The toggles only ever carry their isolating state here.
    private var hasListFilters: Bool {
        store.participantUserId != nil
            || store.projectFilterId != store.scopeProjectId
            || store.notCountedOnly
            || store.budgetExcluded == true
            || store.kind != nil
    }

    /// The active ledger's projects, from the app-level per-ledger cache —
    /// kept warm by the ledger switcher's own load.
    private var ledgerProjects: [QianlaiProject] {
        guard let ledger = ledgerStore.activeLedger else { return [] }
        return projectStore.projects(for: ledger.id)
    }

    /// Active projects only. Archived ones are excluded on purpose (their
    /// history lives on the project page), which is also why a set filter
    /// must not keep pointing at one: the picker would render its row
    /// blank while the list stays filtered.
    private var projectFilterOptions: [QianlaiProject] {
        guard let ledger = ledgerStore.activeLedger else { return [] }
        return projectStore.activeProjects(for: ledger.id)
    }

    /// Participant filter options, scoped to the active project filter
    /// when one is set — a project's entries can only be tagged with that
    /// project's members, including outsiders who hold no roster row.
    /// Falls back to the full ledger roster otherwise.
    private var participantCandidates: [EntryPerson] {
        if let projectId = store.projectFilterId,
           let project = ledgerProjects.first(where: { $0.id == projectId }) {
            return project.members.map(\.entryPerson)
        }
        return memberStore.members.map(\.entryPerson)
    }

    /// The project currently claiming scope in the ledger switcher.
    private var scopedProject: QianlaiProject? {
        guard let ledger = ledgerStore.activeLedger else { return nil }
        return projectStore.scopedProject(in: ledger.id, isGuestLedger: ledger.isGuest)
    }

    /// The sheet itself. The scope-claimed project is visible but locked
    /// (the switcher owns it); with no project filter the not-counted
    /// toggle appears — a project filter always shows every entry of
    /// that project, so the flag would be a no-op.
    private var filterSheet: some View {
        NavigationStack {
            Form {
                // The kind axis leads the sheet (Lisiur's order): all /
                // expense / income (transfer stays drill-only — the panel
                // offers the trio the ledger speaks). On a non-all pick
                // the list narrows to entries classified that way, the
                // same server classification the rows render by, and the
                // cards follow through the StatsFilters capture.
                Section {
                    Picker(
                        L10n.string("journal.filterKind", defaultValue: "Type"),
                        selection: Binding(
                            get: { store.kind?.rawValue ?? "" },
                            // An unknown/empty pick lands back on All
                            // (init failure = nil), the same "" sentinel
                            // style the id pickers on this sheet use.
                            set: { store.kind = QuickEntryKind(rawValue: $0) }
                        )
                    ) {
                        Text(L10n.string("filters.all", defaultValue: "All")).tag("")
                        Text(L10n.string("quick.kind.expense", defaultValue: "Expense")).tag(QuickEntryKind.expense.rawValue)
                        Text(L10n.string("quick.kind.income", defaultValue: "Income")).tag(QuickEntryKind.income.rawValue)
                    }
                }
                // The participant pick rides right under the kind axis
                // (Lisiur's order): options scoped to the active project
                // filter when one is set, else the full ledger roster.
                if !participantCandidates.isEmpty {
                    Section {
                        Picker(
                            L10n.string("journal.filterParticipant", defaultValue: "Participant"),
                            selection: Binding(
                                get: { store.participantUserId ?? "" },
                                set: { store.participantUserId = $0.isEmpty ? nil : $0 }
                            )
                        ) {
                            Text(L10n.string("journal.filterAllMembers", defaultValue: "All Members")).tag("")
                            ForEach(participantCandidates) { member in
                                Text(member.displayName).tag(member.id)
                            }
                        }
                    }
                }
                if !projectFilterOptions.isEmpty {
                    Section {
                        Picker(
                            L10n.string("journal.filterProject", defaultValue: "Project"),
                            selection: Binding(
                                get: { store.projectFilterId ?? "" },
                                set: { store.projectFilterId = $0.isEmpty ? nil : $0 }
                            )
                        ) {
                            Text(L10n.string("journal.filterAllProjects", defaultValue: "All Projects")).tag("")
                            ForEach(projectFilterOptions) { project in
                                Text(project.name).tag(project.id)
                            }
                        }
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
                // Mirror of the budget toggle, on the other opt-out: on,
                // the list narrows to entries recorded 不计收支; off
                // (default) lists everything. The per-entry flag exists
                // within projects too — the server honors the axis on
                // project-scoped queries — so the row always shows.
                Section {
                    Toggle(
                        L10n.string("journal.filterNotCounted", defaultValue: "Only Not-Counted"),
                        isOn: Binding(
                            get: { store.notCountedOnly },
                            set: { store.notCountedOnly = $0 }
                        )
                    )
                }
                // The budget opt-out as its own axis: on, the list narrows
                // to entries marked 不计入日常预算 (the budget card's
                // excluded column's caliber); off (default) lists every
                // entry. Like the not-counted toggle, a project filter
                // does not mute it — the per-entry flag exists within
                // projects too, so the row always shows.
                Section {
                    Toggle(
                        L10n.string("journal.filterNotBudget", defaultValue: "Only Budget-Excluded"),
                        isOn: Binding(
                            get: { store.budgetExcluded == true },
                            set: { store.budgetExcluded = $0 ? true : nil }
                        )
                    )
                }
            }
            .navigationTitle(Text(L10n.string("filters.title", defaultValue: "Filters")))
            .inlineNavigationBarTitle()
            // One row per Section reads as separate cards; the compact
            // section spacing keeps them a tight stack instead of the
            // default airiness a five-row sheet floats in.
            .listSectionSpacing(.compact)
            .toolbar {
                if hasListFilters {
                    ToolbarItem(placement: .cancellationAction) {
                        // nil clearAction = the page-wide reset: besides
                        // this sheet's picks it also lifts the header's
                        // date range and the search field
                        // (store.clearFilters). A host override swaps the
                        // action; the button's visibility still tracks the
                        // structural picks only.
                        Button(role: .destructive) {
                            if let clearAction {
                                clearAction()
                            } else {
                                store.clearFilters()
                            }
                            isPresented = false
                        } label: {
                            Text(L10n.string("filters.clear", defaultValue: "Clear"))
                        }
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.string("common.done", defaultValue: "Done")) {
                        isPresented = false
                    }
                }
            }
        }
        #if os(iOS)
        .presentationDetents([.medium, .large])
        #endif
    }
}

/// The amount-order menu that sits beside the funnel on every journal-
/// filtered surface: default (date) order, amount high-to-low, amount
/// low-to-high — written straight onto the store, whose debounced
/// didSet owns the reload. Presentation intent, not a filter: it never
/// tints the funnel. The default `.date` stays a plain Button and never
/// carries the checkmark — it's the list's natural state, so only a
/// deviation from it gets marked; the amount orders carry their
/// on-state as Toggles — UIKit's own selection-state channel, so the
/// checkmark renders in the menu's trailing state column on every OS
/// build (the hand-drawn Label icon this replaces is placed per-build
/// by SwiftUI: column on the 26.5 simulator, inline against the title
/// on device). A non-default sort tints the icon accent.
struct JournalSortMenu: View {
    let store: JournalStore

    var body: some View {
        Menu {
            Button {
                store.sort = .date
            } label: {
                Text(L10n.string("journal.sortDefault", defaultValue: "Default"))
            }
            Toggle(
                L10n.string("journal.sortAmountDesc", defaultValue: "Amount: high to low"),
                isOn: sortActiveBinding(.amountDescending)
            )
            Toggle(
                L10n.string("journal.sortAmountAsc", defaultValue: "Amount: low to high"),
                isOn: sortActiveBinding(.amountAscending)
            )
        } label: {
            CircleIcon(systemName: "arrow.up.arrow.down", isActive: store.sort != .date)
        }
        .accessibilityLabel(Text(L10n.string("journal.sort", defaultValue: "Sort")))
    }

    /// Radio-style on-state for one amount order: on only while `sort` is
    /// that order, and writes only ever turn an order ON — tapping the
    /// already-active row just closes the menu with the selection intact.
    private func sortActiveBinding(_ sort: JournalStore.EntrySort) -> Binding<Bool> {
        Binding(
            get: { store.sort == sort },
            set: { if $0 { store.sort = sort } }
        )
    }
}

/// One range endpoint: a plain yyyy/MM/dd field that opens the system
/// graphical calendar in a small popover (a compact sheet on iPhone). The
/// compact DatePicker was bypassed because its chrome carries quick-step
/// arrows and renders the date in the locale's own format — this field
/// keeps both ends fixed to one numeric format. Lives beside its only
/// consumers (the window control above).
struct RangeDateField: View {
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
