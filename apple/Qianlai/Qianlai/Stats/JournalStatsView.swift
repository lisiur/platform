//
//  JournalStatsView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/19.
//

import SwiftUI

/// The chart page's push payload: the ledger snapshot plus the window and
/// the structural filters captured at tap time — the host surface's
/// bounds and filters keep moving behind a push, and the pushed page must
/// describe the state the user tapped on. Distinct from the cards' drill
/// payload (`StatDetailTarget`): this one carries the window instead of a
/// drill filter. Shared by every stats host — the dashboard, the journal
/// page, and the drill-down pages' own chart entries (one type, not one
/// private twin per surface).
struct StatsTarget: Identifiable, Hashable {
    let ledger: QianlaiLedger
    let window: MonthWindow
    let filters: StatsFilters?

    var id: String {
        let filterToken = filters.flatMap(StatsFilters.keySegment) ?? "-"
        return "\(ledger.id)|\(window.from.timeIntervalSince1970)|\(window.to.timeIntervalSince1970)|\(filterToken)"
    }
}

/// The chart page's entry button — the `chart.bar.xaxis` chrome and its
/// label, shared verbatim by every host that raises a `StatsTarget` (the
/// dashboard toolbar, the journal page, the drill-down pages). The
/// action stays the host's: the capture (window + filters at tap time)
/// is deliberately per-surface.
struct StatsEntryButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "chart.bar.xaxis")
        }
        .accessibilityLabel(Text(L10n.string("journal.stats", defaultValue: "Charts")))
    }
}

/// The journal page's chart page: the reusable stats component rendering
/// the journal's active window and structural filters (the funnel sheet's
/// participant/project picks), captured at push time — the list's bounds
/// and filters keep moving behind the push otherwise; the page never
/// follows them. The cards' drills push the same filtered-journal page
/// the dashboard's cards use, windowed to this page's range and seeded
/// with the same filters so the rows reconcile with the tapped figures;
/// swipe edits down there bump the shared epoch the component listens
/// on, so the cards re-summarize live. Reached only where the journal's
/// stat card shows (not a guest — the report endpoints 403 them — and
/// not in project scope, where the cards' ledger-wide numerals would
/// misdescribe a project-only list).
struct JournalStatsView: View {
    @Environment(\.locale) private var locale

    let ledger: QianlaiLedger
    let window: MonthWindow
    /// The journal filters captured at push time (nil = unfiltered). The
    /// component's show/hide opt-out toggle is deliberately not among
    /// them: 不计收支 amounts stay out of every stat, charts included.
    var filters: StatsFilters? = nil

    /// One windowed store for this surface, so a drill page's live epoch
    /// refresh can't clash with the dashboard tab's payloads.
    @State private var store = StatsStore()
    @State private var drillTarget: StatDetailTarget?

    var body: some View {
        List {
            StatsCardsView(
                store: store,
                ledgerId: ledger.id,
                currency: ledger.currency,
                window: window,
                filters: filters,
                expenseAction: { openDrill(JournalDrillDown(kind: .expense)) },
                incomeAction: { openDrill(JournalDrillDown(kind: .income)) },
                onSelectDay: { day, kind in openDrill(JournalDrillDown(kind: kind), day: day) },
                onSelectCategory: { openDrill($0) }
            )
            // The dashboard summary's chrome: one list row so the cards
            // keep their inset-grouped metrics (horizontal margins from
            // the list itself, wallpaper behind). The vertical padding is
            // load-bearing: iOS 26 clips row content to the section's
            // rounded corners, so a card flush at the row top loses its
            // rim to the corner mask — the dashboard's summary VStack
            // carries the same 8pt for the same reason.
            .padding(.vertical, 8)
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())
        }
        .appBackgroundSink()
        .scrollBounceBehavior(.basedOnSize)
        .refreshable {
            await store.load(ledgerId: ledger.id, window: window, filters: filters)
        }
        .navigationTitle(Text(AppDates.formatWindowTitle(window, locale: locale)))
        .inlineNavigationBarTitle()
        .navigationDestination(item: $drillTarget) { target in
            StatKindDetailView(
                ledger: target.ledger,
                filter: target.filter,
                window: window,
                day: target.day,
                filters: target.filters
            )
        }
        // The component's own task fetches on mount, window change, and
        // every appearance — no page-level fetch here.
    }

    private func openDrill(_ drill: JournalDrillDown, day: Date? = nil) {
        drillTarget = StatDetailTarget(
            ledger: ledger, filter: drill, day: day, filters: filters
        )
    }
}
