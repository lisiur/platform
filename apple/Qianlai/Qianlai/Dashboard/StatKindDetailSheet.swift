//
//  StatKindDetailSheet.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/18.
//

import SwiftUI

/// One dashboard drill-down sheet's filter shape: kind (expense or income)
/// plus an optional category drill-down (a leaf account, or a top-level
/// parent for a 一级分类 rollup bucket). nil filters describe the same
/// "by kind, no category" view the stat card's first iteration opened.
/// `categoryLabel`, when set, swaps the title to "时间 · 分类"
/// instead of "时间 · 支出/收入".
struct JournalDrillDown: Equatable {
    var kind: QuickEntryKind
    var accountId: String?
    var parentAccountId: String?
    var categoryLabel: String?
}

/// The dashboard's drill-down sheet — the journal of the selected month,
/// filtered to one of the stat card's surfaces:
/// - the stat card's expense hero / income column (no category scope)
/// - the composition card's leaf rows (a single `accountId`)
/// - the composition card's top-level rollup rows (a single `parentAccountId`)
/// Reuses the journal page's shared entry list (EntryListView) with a
/// private store pre-filtered to the month window and filter — the rows
/// carry the journal page's day headers, pagination, and swipe
/// edit/delete. Swipe actions bump the shared report epoch so the cards
/// behind the sheet re-summarize live.
struct StatKindDetailSheet: View {
    @Environment(\.locale) private var locale
    @Environment(\.dismiss) private var dismiss

    let ledger: QianlaiLedger
    let filter: JournalDrillDown
    /// The dashboard month the card summarizes — the sheet's fixed window.
    let month: YearMonth

    /// Private entry store, injected below so the sheet's rows act on this
    /// list without clashing with the Journal tab's root store. Configured
    /// before `load` so the first fetch is already windowed and filtered —
    /// the same pattern as the project drill-downs.
    @State private var store = JournalStore()

    var body: some View {
        NavigationStack {
            EntryListView(
                ledger: ledger,
                emptyMessage: L10n.string("journal.empty", defaultValue: "No entries yet"),
                // A stats drill-down, like the statement pages: no posting
                // footnote; posters keep the swipe actions.
                showsPostHint: false,
                // Ledger-wide surface: project entries carry the ledger
                // members' combined share, like the journal list.
                showsProjectShare: true
            )
            .environment(store)
            // No .refreshable here on purpose: the refresh control swallows
            // the list's top pull gesture, so the sheet would never dismiss
            // by pulling down. The .task below reloads on open; swipe
            // actions keep the cards behind in sync.
            // Title, search, and the close button all live INSIDE the
            // NavigationStack — attached outside it, the navigation bar
            // never collects them (the close button silently vanished
            // that way).
            .navigationTitle(Text(title))
            .inlineNavigationBarTitle()
            // Keyword filter, pinned always-visible in the sheet's nav bar.
            .journalSearchable(store, alwaysVisible: true)
            .toolbar {
                // Close sits leading, the sheet-dismiss convention — this
                // sheet only reads, nothing to confirm.
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.string("common.close", defaultValue: "Close")) {
                        dismiss()
                    }
                }
            }
            .task {
                store.setWindow(AppDates.monthWindow(containing: month.start))
                store.kind = filter.kind
                store.accountId = filter.accountId
                store.parentAccountId = filter.parentAccountId
                await store.load(ledgerId: ledger.id)
            }
        }
    }

    /// "Sep 2026 · Expense" / "Sep 2026 · 餐饮" — the dashboard's selected
    /// month plus either the kind (no category drill) or the tapped
    /// category label. The category label is carried by the filter, so the
    /// sheet never looks it up by id.
    private var title: String {
        let head = AppDates.formatMonthTitle(month, locale: locale)
        if let category = filter.categoryLabel {
            return "\(head) · \(category)"
        }
        return "\(head) · \(filter.kind.label)"
    }
}