//
//  JournalStatsView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/19.
//

import SwiftUI

/// The journal page's chart page: the reusable stats component rendering
/// the journal's active window, captured at push time (the list's bounds
/// keep moving behind the push otherwise — the page never follows them).
/// The cards' drills push the same filtered-journal page the dashboard's
/// cards use, windowed to this page's range; swipe edits down there bump
/// the shared epoch the component listens on, so the cards re-summarize
/// live. Reached only where the journal's stat card shows (not a guest —
/// the report endpoints 403 them — and not in project scope, where the
/// cards' ledger-wide numerals would misdescribe a project-only list).
struct JournalStatsView: View {
    @Environment(\.locale) private var locale

    let ledger: QianlaiLedger
    let window: MonthWindow

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
                expenseAction: { openDrill(JournalDrillDown(kind: .expense)) },
                incomeAction: { openDrill(JournalDrillDown(kind: .income)) },
                onSelectDay: { day, kind in openDrill(JournalDrillDown(kind: kind), day: day) },
                onSelectCategory: { openDrill($0) }
            )
            // The dashboard summary's chrome: one list row so the cards
            // keep their inset-grouped metrics (horizontal margins from
            // the list itself, wallpaper behind).
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())
        }
        .appBackgroundCanvas()
        .scrollBounceBehavior(.basedOnSize)
        .refreshable {
            await store.load(ledgerId: ledger.id, window: window)
        }
        .navigationTitle(Text(AppDates.formatWindowTitle(window, locale: locale)))
        // Large, not inline — the same offset-neutral rule as the drill
        // page: the journal source page is large-titled, and an inline
        // destination collapses the bar mid-push, scrolling the source's
        // list one large-title height (restored on pop). Equal-height
        // bars on every level keep push/pop offset-neutral.
        .largeNavigationBarTitle()
        .navigationDestination(item: $drillTarget) { target in
            StatKindDetailView(ledger: target.ledger, filter: target.filter, window: window, day: target.day)
        }
        // The component's own task fetches on mount, window change, and
        // every appearance — no page-level fetch here.
    }

    private func openDrill(_ drill: JournalDrillDown, day: Date? = nil) {
        drillTarget = StatDetailTarget(ledger: ledger, filter: drill, day: day)
    }
}
