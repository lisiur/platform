//
//  MonthCalendarView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/22.
//

import SwiftUI

/// The month view page: the selected month's calendar with that day's
/// journal beneath it — one page, no push. The month header repeats the
/// dashboard's stepper (chevrons around the month title, capped at the
/// current month); the calendar is the dashboard's `MonthCalendarCard`,
/// but a tap only SELECTS the day — the shared entry list below re-aims
/// to midnight→end-of-day of the tap through a private `JournalStore`
/// (day headers, swipe edit/delete, pagination, the same rows the drill
/// pages render). The calendar's per-day amounts come from the
/// daily-summary report (members share mode) through a private
/// `StatsStore` — categories skipped, no composition card mounts here —
/// and refetch on the shared report epoch, so a swipe edit in the day
/// list re-summarizes the calendar live.
///
/// Reached from the dashboard's toolbar calendar button, ledger scope
/// only: the amounts are the ledger-wide daily summary, whose endpoint
/// 403s guests, and project scope swaps the whole dashboard page.
struct MonthCalendarView: View {
    @Environment(\.locale) private var locale
    /// Optional so the page can mount outside the app's store environment
    /// (the harness); nil just skips the epoch refresh.
    @Environment(ReportStore.self) private var reportStore: ReportStore?

    /// The ledger snapshot captured at push time — every tap path requires
    /// an active ledger, and a scope change mid-push keeps operating on
    /// the captured snapshot (the drill-down rule).
    let ledger: QianlaiLedger

    /// The month the calendar renders; stepped with the header chevrons,
    /// capped at the current month (the dashboard header's rule).
    @State private var selectedMonth = YearMonth.current
    /// The selected day — the entry list beneath re-aims to it. Starts on
    /// the START of today (the initial month is always the current one, so
    /// the default is always in view) — the same value `defaultDay` lands
    /// on, so the mount-time re-seat is a same-value no-op rather than a
    /// task identity flip that would cancel the first fetch mid-flight.
    @State private var selectedDay = Calendar.current.startOfDay(for: .now)
    /// The calendar's per-day totals, one windowed store for this surface.
    @State private var statsStore = StatsStore()
    /// Private entry store, so the day's rows act on this page without
    /// clashing with the Journal tab's root store (the drill-down rule).
    @State private var store = JournalStore()

    /// The selection a month step lands on: the start of today when the
    /// rendered month is the current one, its first day otherwise — the
    /// detail area never sits without a day.
    private var defaultDay: Date {
        selectedMonth == YearMonth.current
            ? Calendar.current.startOfDay(for: .now)
            : selectedMonth.start
    }

    var body: some View {
        EntryListView(
            ledger: ledger,
            emptyMessage: L10n.string(
                "dashboard.monthView.emptyDay",
                defaultValue: "No entries on this day"
            ),
            // A browsing surface like the drill pages: no posting footnote;
            // posters keep the swipe actions.
            showsPostHint: false,
            topContent: AnyView(calendarHeader),
            // Ledger-wide surface: project entries carry the ledger
            // members' combined share, like the journal list.
            showsShareCaption: true
        )
        .environment(store)
        .refreshable {
            async let entries: () = store.reload()
            async let calendar: () = loadCalendar()
            _ = await (entries, calendar)
        }
        .task(id: selectedMonth) {
            selectedDay = defaultDay
            await loadCalendar()
        }
        .task(id: selectedDay) {
            let start = Calendar.current.startOfDay(for: selectedDay)
            await store.aim(
                ledgerId: ledger.id,
                window: MonthWindow(from: start, to: AppDates.localEndOfDay(start))
            )
        }
        // A post/update/delete anywhere bumps the shared epoch — the day
        // rows re-read on the same bump (the Journal tab's own rule), so
        // a swipe edit under the finger re-summarizes both the list and
        // the calendar.
        .onChange(of: reportStore?.journalEpoch ?? 0) {
            Task {
                async let entries: () = store.reload()
                async let calendar: () = loadCalendar()
                _ = await (entries, calendar)
            }
        }
        // "Month view" — still set explicitly: left unset, the dashboard's
        // title would pass through as this page's (the nested-title rule);
        // the month itself stays in the stepper below.
        .navigationTitle(L10n.string("dashboard.monthView", defaultValue: "Month view"))
        .inlineNavigationBarTitle()
    }

    /// The calendar header: the dashboard-shaped stepper above the
    /// calendar card, as one chrome-free row so it scrolls away with the
    /// day's records.
    private var calendarHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            monthStepper
                // The same little inset the dashboard's header row carries:
                // the card spans the row's full width, the chrome-less
                // stepper above it insets a little instead.
                .padding(.horizontal, 6)
            MonthCalendarCard(
                days: statsStore.daily ?? [],
                month: selectedMonth,
                locale: locale,
                onSelectDay: { selectedDay = $0 },
                selectedDay: selectedDay
            )
        }
        // The vertical padding keeps the card's glass rim clear of the
        // section's rounded corners (the corner-mask rule the dashboard's
        // summary carries the same 8pt for).
        .padding(.vertical, 8)
    }

    /// The month header, dashboard-shaped: arrows hug the title, the right
    /// chevron caps at the current month.
    private var monthStepper: some View {
        HStack(spacing: 8) {
            Button {
                selectedMonth = selectedMonth.previous
            } label: {
                CircleIcon(systemName: "chevron.left")
            }
            // Borderless: with the default style a tap on the List row
            // fires BOTH chevrons, canceling each other out.
            .buttonStyle(.borderless)
            Text(AppDates.formatMonthTitle(selectedMonth, locale: locale))
                .font(.title3.weight(.semibold))
            Button {
                selectedMonth = selectedMonth.next
            } label: {
                CircleIcon(systemName: "chevron.right")
            }
            .buttonStyle(.borderless)
            .disabled(selectedMonth >= YearMonth.current)
            Spacer()
        }
    }

    /// The calendar's daily-summary fetch — the same payload the dashboard
    /// calendar card reads, at the members share mode, categories skipped
    /// (nothing here consumes them). Guests 403 the endpoint, so they
    /// fetch nothing; their calendar renders the lunar labels alone.
    private func loadCalendar() async {
        guard !ledger.isGuest else { return }
        await statsStore.load(
            ledgerId: ledger.id,
            window: AppDates.monthWindow(containing: selectedMonth.start),
            includesCategories: false
        )
    }
}
