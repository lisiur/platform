//
//  StatKindDetailView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/18.
//

import SwiftUI

/// One dashboard drill-down's filter shape: an optional kind (expense or
/// income) plus an optional category drill-down (a leaf account, or a
/// top-level parent for a 一级分类 rollup bucket). A nil kind describes the
/// calendar card's day drill — every entry of the day, transfers included.
/// `categoryLabel`, when set, swaps the title to "时间 · 分类" instead of
/// "时间 · 支出/收入". `isBudgetExcluded`, when set, scopes the list to one
/// side of the per-entry budget flag (the budget card's 日常已花 / 不计入预算
/// columns — always carried with kind = .expense, the pools being
/// expense-only) and swaps the title to "时间 · 日常已花/不计入预算".
struct JournalDrillDown: Hashable {
    var kind: QuickEntryKind?
    var accountId: String?
    var parentAccountId: String?
    var categoryLabel: String?
    var isBudgetExcluded: Bool?

    /// Whether the filter resolves an account axis (leaf or parent) —
    /// the composition card's drill gate: a row that can't scope an
    /// account stays inert rather than opening a month-wide view.
    var scopesAccount: Bool {
        accountId != nil || parentAccountId != nil
    }
}

/// One stats drill-down's push payload — the ledger snapshot captured at
/// tap time (every tap path requires an active ledger, so the drill-down
/// can never mount target-less, and a scope change mid-push keeps
/// operating on the captured snapshot). `day`, when set, drills the
/// calendar card's single day (all kinds); otherwise the filter's
/// kind/category axes drive the window. `id` covers every filter axis the
/// tap can carry so a quick re-tap of the same figure re-pushes cleanly
/// (the item's identity flips). Shared by every stats host — the
/// dashboard and the journal's chart page.
struct StatDetailTarget: Identifiable, Hashable {
    let ledger: QianlaiLedger
    let filter: JournalDrillDown
    let day: Date?

    var id: String {
        let dayKey = day.map { String($0.timeIntervalSince1970) } ?? "-"
        let kindKey = filter.kind?.rawValue ?? "all"
        let budgetKey = filter.isBudgetExcluded.map { $0 ? "excl" : "counted" } ?? "-"
        return "\(ledger.id)|\(dayKey)|\(kindKey)|\(budgetKey)|\(filter.accountId ?? "")|\(filter.parentAccountId ?? "")|\(filter.categoryLabel ?? "")"
    }
}

/// The stats drill-down PAGE — the journal of the summarized window,
/// filtered to one of the stat card's surfaces:
/// - the stat card's expense hero / income column (no category scope)
/// - the composition card's leaf rows (a single `accountId`)
/// - the composition card's top-level rollup rows (a single `parentAccountId`)
/// - the calendar card's day cells and the trend card's readout bubble
///   (`day` set): that LOCAL day alone, all kinds or the caller's kind,
///   instead of the window
/// Reuses the journal page's shared entry list (EntryListView) with a
/// private store pre-filtered to the window and filter — the rows
/// carry the journal page's day headers, pagination, and swipe
/// edit/delete. Swipe actions bump the shared report epoch so the cards
/// behind re-summarize live.
///
/// Mounted as a stack PUSH, never a sheet: an iOS 26 presentation quirk
/// remounts a fullScreenCover's content whenever another sheet presents on
/// top of it while a searchable sheet sits anywhere below in the
/// presentation stack — from the old sheet mounting, every quick-entry
/// sub-picker (account/more/date) closed itself ~1s after opening and the
/// cover's whole state reset (the category grid blanked and reloaded) on
/// every presentation edge. A push adds no UIKit presentation host, so the
/// edit-cover-on-this-page shape is the battle-tested journal-tab chain.
struct StatKindDetailView: View {
    @Environment(\.locale) private var locale

    let ledger: QianlaiLedger
    let filter: JournalDrillDown
    /// The window the tapped card summarizes — the page's fixed window
    /// (also the fallback context when only `day` drills). Any local
    /// range: the dashboard passes the selected month, a future journal
    /// stats page passes its week/range.
    let window: MonthWindow
    /// When set, the page windows to this single LOCAL day instead of the
    /// month; `filter.kind` still scopes within the day when set (the
    /// calendar drills all kinds, the trend card drills its metric).
    var day: Date? = nil
    /// The journal chart page's captured structural filters, seeded onto
    /// the private store so the drill's rows (and their day headers)
    /// reconcile with the filtered figures the user tapped. The dashboard's
    /// drills leave it nil — its cards summarize the unfiltered ledger.
    var filters: StatsFilters? = nil

    /// Private entry store, injected below so the rows act on this
    /// list without clashing with the Journal tab's root store. Configured
    /// before `load` so the first fetch is already windowed and filtered —
    /// the same pattern as the project drill-downs.
    @State private var store = JournalStore()

    var body: some View {
        EntryListView(
            ledger: ledger,
            emptyMessage: L10n.string("journal.empty", defaultValue: "No entries yet"),
            // A stats drill-down, like the statement pages: no posting
            // footnote; posters keep the swipe actions.
            showsPostHint: false,
            // Ledger-wide surface: project entries carry the ledger
            // members' combined share, like the journal list.
            showsShareCaption: true
        )
        .environment(store)
        // Pull-to-refresh is back: the drop was a sheet-mount accommodation
        // (the refresh control swallowed the sheet's top pull-to-dismiss),
        // and the push has no such gesture to protect — same shape as the
        // pushed statement pages.
        .refreshable {
            await store.reload()
        }
        // The title must live INSIDE the enclosing NavigationStack's pushed
        // content — attached outside it, the navigation bar never collects
        // it. No searchable here: the field's system glass background only
        // engages after the push transition, flashing a bare field for the
        // first frames, and a one-page keyword filter wasn't worth it.
        //
        // Large, not inline: the dashboard source page is large-titled, and
        // an inline destination collapses the bar mid-push — the system
        // compensates by scrolling the dashboard's list one large-title
        // height (restored on pop), which reads as a phantom auto-scroll.
        // Equal-height bars on both ends keep the push/pop offset-neutral.
        .navigationTitle(Text(title))
        .largeNavigationBarTitle()
        .task {
            if let day {
                // One LOCAL day, midnight through end-of-day.
                let start = Calendar.current.startOfDay(for: day)
                store.setWindow(MonthWindow(from: start, to: AppDates.localEndOfDay(start)))
            } else {
                store.setWindow(window)
            }
            store.kind = filter.kind
            store.accountId = filter.accountId
            store.parentAccountId = filter.parentAccountId
            store.budgetExcluded = filter.isBudgetExcluded
            store.participantUserId = filters?.participantUserId
            store.projectFilterId = filters?.projectId
            await store.load(ledgerId: ledger.id)
        }
    }

    /// "Sep 2026 · Expense" / "Sep 2026 · 餐饮" — the summarized window
    /// plus either the kind (no category drill) or the tapped category
    /// label; the category label is carried by the filter, so the page
    /// never looks it up by id. The budget card's drills title with the
    /// tapped column's own label ("日常已花" / "不计入预算"), same rule.
    /// Day drills replace the head with the full
    /// date ("2026年9月21日" / "Sep 21, 2026"), the same medium date the
    /// journal's day headers render, plus the kind when the drill scopes
    /// one (the calendar's all-kinds drill shows the date alone). A
    /// single-month window titles as that month; any other range falls
    /// back to the week stepper's from–to rendering.
    private var title: String {
        if let day {
            let head = AppDates.formatEntryDay(day, locale: locale)
            if let kind = filter.kind {
                return "\(head) · \(kind.label)"
            }
            return head
        }
        let head = AppDates.formatWindowTitle(window, locale: locale)
        if let category = filter.categoryLabel {
            return "\(head) · \(category)"
        }
        if let budgetExcluded = filter.isBudgetExcluded {
            return "\(head) · \(budgetTitleLabel(excluded: budgetExcluded))"
        }
        if let kind = filter.kind {
            return "\(head) · \(kind.label)"
        }
        return head
    }

    /// The budget drill's title label — the budget card column the drill
    /// opened from, so the page titles exactly like the tapped figure.
    private func budgetTitleLabel(excluded: Bool) -> String {
        excluded
            ? L10n.string("budget.excluded", defaultValue: "Excluded")
            : L10n.string("budget.spent", defaultValue: "Spent")
    }
}
