//
//  StatsCardsView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/19.
//

import SwiftUI

/// The reusable stats component: a window's overview stat block — plus,
/// when the host mounts them, the trend chart and the composition chart
/// — stacked in the dashboard's card rhythm for ANY local date range.
/// The dashboard mounts the stat block alone for the selected month (the
/// charts on the journal's chart page); the journal chart page mounts
/// the full set for a week or custom range. The month calendar never
/// mounts here: the month view has its own page (the toolbar calendar
/// button's MonthCalendarView).
///
/// Data: the component drives an injected `StatsStore` — one instance per
/// mounted surface, so a stats page pushed above the dashboard tab can
/// never overwrite the tab's payloads (the drill-down's private
/// `JournalStore` rule). It fetches on mount, window change, and every
/// appearance, and re-fetches when the shared report epoch bumps (a
/// swipe edit in a drill page below re-summarizes the cards live — the
/// journal page's own stat card follows the same epoch). Guests 403 every
/// report endpoint, so hosts pass `isReportingEnabled: false` and the
/// cards render their placeholder/empty states — the gate stays
/// expressed through data.
///
/// Drills: the callbacks are the component's whole exit — the host owns
/// the navigation (the dashboard pushes `StatKindDetailView`). nil keeps
/// a surface inert (the screenshot harness).
struct StatsCardsView: View {
    /// The shared report epoch — read only for the live-refresh bump.
    /// Optional so the component can mount outside the app's store
    /// environment (the harness); nil just skips the epoch refresh.
    @Environment(ReportStore.self) private var reportStore: ReportStore?
    @Environment(\.locale) private var locale

    /// The windowed payloads. Caller-owned so a host can reach in (the
    /// dashboard's pull-to-refresh reloads the same store the cards read).
    let store: StatsStore
    let ledgerId: String
    var currency: String?
    /// false skips every fetch — guests' report endpoints 403.
    var isReportingEnabled = true
    /// Month-prefixed stat labels (月支出/月收入/月结余) — the dashboard's
    /// month-stepped block only; the journal chart page's window varies
    /// with the list's tabs and keeps the bare labels.
    var monthPrefixedLabels = false
    /// false hides the trend chart and the composition chart (the
    /// dashboard's layout: overview block only) and skips the
    /// category-summary fetch that feeds the latter. The journal chart
    /// page keeps the default.
    var showsTrendAndComposition = true
    /// The LOCAL window the cards summarize. A window that is exactly one
    /// natural month additionally mounts the calendar card; wider ranges
    /// hide it (a calendar grid is month-shaped).
    let window: MonthWindow
    /// The journal's structural filters the host surface is scoped to
    /// (the journal chart page's push-time capture). nil = the dashboard
    /// tab's unfiltered ledger stats. A filtered surface's totals never
    /// republish the widget snapshot, so it must not claim the posting
    /// path's dedupe either — the liveness registration below is
    /// unfiltered-only.
    var filters: StatsFilters? = nil
    /// The stat block's kind drills (expense hero / income column).
    var expenseAction: (() -> Void)? = nil
    var incomeAction: (() -> Void)? = nil
    /// A day drill — the calendar's cell (all kinds) and the trend
    /// card's readout bubble (the metric's kind, 结余 = nil). The calendar
    /// passes the same callback with a nil kind.
    var onSelectDay: ((Date, QuickEntryKind?) -> Void)? = nil
    /// A composition row/slice drill (kind + account axes + label).
    var onSelectCategory: ((JournalDrillDown) -> Void)? = nil
    /// false renders nothing — the overview block lives inside the host's
    /// own card (the dashboard's budget overview card absorbed it), while
    /// this mount keeps the fetch/debounce/epoch/surface-watch lifecycle
    /// below running so the store stays live. The anchor is a zero-size
    /// view, not EmptyView: appearance callbacks never fire on EmptyView.
    var rendersOverview = true

    /// The task key: ledger, window bounds, and the filter segment. Reacting
    /// to the window — not just the ledger — is what re-aims the cards when
    /// the host steps its month/range; the filters are fixed per mounted
    /// page but belong in the key so identity survives a host that re-aims
    /// them.
    private var loadKey: String {
        let filterToken = StatsFilters.keySegment(filters) ?? "-"
        return "\(ledgerId)|\(window.from.timeIntervalSince1970)|\(window.to.timeIntervalSince1970)|\(filterToken)"
    }

    /// The fetch-skip derivation, stated once — both load sites read
    /// these instead of re-deriving from the mount flags.
    private var includesDaily: Bool {
        showsTrendAndComposition
    }

    private var includesCategories: Bool {
        showsTrendAndComposition
    }

    /// The previous load key this identity saw — nil until the first
    /// load, so mounts and same-key re-appearances are distinguishable
    /// from real window changes (which debounce).
    @State private var lastLoadKey: String?

    var body: some View {
        Group {
            if rendersOverview {
                VStack(alignment: .leading, spacing: 10) {
                    StatSummaryBlock(
                        totals: store.overview?.month,
                        currency: currency,
                        expenseAction: expenseAction,
                        incomeAction: incomeAction,
                        monthPrefixedLabels: monthPrefixedLabels
                    )
                    if showsTrendAndComposition, let daily = store.daily {
                        TrendChartCard(
                            days: daily,
                            window: window,
                            currency: currency,
                            locale: locale,
                            onSelectDay: { onSelectDay?($0, $1) }
                        )
                    }
                    if showsTrendAndComposition, let categories = store.categories {
                        CategoryBreakdownCard(
                            summary: categories,
                            currency: currency,
                            locale: locale,
                            onSelectCategory: { onSelectCategory?($0) }
                        )
                    }
                }
            } else {
                Color.clear.frame(height: 0)
            }
        }
        .task(id: loadKey) {
            // Window changes debounce (`ReloadDebounce.interval` — the old
            // dashboard reload's coalescing) so rapid month steps fire one
            // fetch for the landing window instead of one per intermediate;
            // the task restart on the next step cancels the pending sleep.
            // Mounts and same-key re-appearances fetch immediately.
            let stepped = lastLoadKey != nil && lastLoadKey != loadKey
            lastLoadKey = loadKey
            guard isReportingEnabled else { return }
            if stepped {
                try? await Task.sleep(for: ReloadDebounce.interval)
                guard !Task.isCancelled else { return }
            }
            await store.load(
                ledgerId: ledgerId, window: window, filters: filters,
                includesDaily: includesDaily,
                includesCategories: includesCategories
            )
        }
        // A post/update/delete anywhere bumps the shared epoch — refetch
        // so the cards re-summarize live under the user's finger.
        .onChange(of: reportStore?.journalEpoch ?? 0) {
            guard isReportingEnabled else { return }
            Task {
                await store.load(
                    ledgerId: ledgerId, window: window, filters: filters,
                    includesDaily: includesDaily,
                    includesCategories: includesCategories
                )
            }
        }
        // Liveness for the posting path's snapshot dedupe: while mounted
        // and fetching, this surface owns the snapshot republish for its
        // window (the epoch onChange above fires on every post), so the
        // post path skips its own dashboard fetch. UNFILTERED surfaces
        // only — a filtered page's totals never republish (the store's
        // overview guard), so claiming the duty here would leave the
        // widget stale after a post. A lazy list row scrolled off-screen
        // unregisters, which only ever costs the dedupe — never a missing
        // publish.
        .onAppear {
            guard isReportingEnabled, filters?.isEmpty ?? true else { return }
            StatsSurfaceWatch.register(ledgerId: ledgerId, window: window)
        }
        .onDisappear {
            guard isReportingEnabled, filters?.isEmpty ?? true else { return }
            StatsSurfaceWatch.unregister(ledgerId: ledgerId, window: window)
        }
        // onAppear doesn't re-fire when the host steps the month in place —
        // re-seat the registration from the old window to the new one.
        .onChange(of: window) { old, new in
            guard isReportingEnabled, filters?.isEmpty ?? true else { return }
            StatsSurfaceWatch.unregister(ledgerId: ledgerId, window: old)
            StatsSurfaceWatch.register(ledgerId: ledgerId, window: new)
        }
    }
}
