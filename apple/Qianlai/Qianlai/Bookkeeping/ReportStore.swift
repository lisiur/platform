//
//  ReportStore.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import Foundation
import Observation

/// Ledger reports: dashboard cards, trial balance, income statement, and
/// member turnover, all scoped to the active ledger and an optional date
/// window (from/to). The dashboard ignores the window (always month-to-date).
@MainActor
@Observable
final class ReportStore {
    let client = APIClient.shared

    private(set) var dashboard: Dashboard?
    private(set) var isLoadingDashboard = false

    /// The budget card's payload for `dashboardMonth` — nil until the first
    /// successful fetch, and stale-safe on failure (the last report stays
    /// published, matching the dashboard's keep-previous behavior). Also
    /// feeds the quick entry's toggle default (`excludedAccountIds`).
    private(set) var budget: BudgetReport?

    /// Month the dashboard cards summarize; nil follows the current month
    /// (server default). Writing it schedules a coalesced dashboard reload,
    /// so `refreshAfterPosting` re-summarizes the month on screen.
    var dashboardMonth: YearMonth? {
        didSet {
            // Observable writes notify even when the value is unchanged;
            // without the guard every re-assignment would schedule another
            // dashboard request.
            guard dashboardMonth != oldValue else { return }
            scheduleDashboardReload()
        }
    }
    private var dashboardReloadTask: Task<Void, Never>?

    /// Writes the month without arming the didSet reload — the dashboard
    /// task fetches immediately after, so the debounced reload would only
    /// duplicate the request. Any pending debounced reload is cancelled for
    /// the same reason.
    func setDashboardMonthSilently(_ month: YearMonth?) {
        dashboardReloadTask?.cancel()
        dashboardReloadTask = nil
        dashboardMonth = month
    }

    /// Bumped by `refreshAfterPosting` after every post/update/delete so
    /// surfaces holding their own entry store (the Dashboard's month list)
    /// can refetch without sharing a `JournalStore` instance.
    private(set) var journalEpoch = 0

    private(set) var trialBalance: TrialBalance?
    private(set) var isLoadingTrialBalance = false

    private(set) var incomeStatement: IncomeStatement?
    private(set) var isLoadingStatement = false

    private(set) var memberTurnover: MemberTurnover?
    private(set) var isLoadingTurnover = false

    private(set) var ledgerId: String?

    var fromDate: Date? { didSet { scheduleWindowedReload() } }
    var toDate: Date? { didSet { scheduleWindowedReload() } }

    /// Coalesces preset commits (both bounds write back-to-back) into one
    /// windowed refresh instead of two overlapping ones.
    private var reloadTask: Task<Void, Never>?

    private func scheduleWindowedReload() {
        reloadTask?.cancel()
        reloadTask = Task {
            try? await Task.sleep(for: .milliseconds(200))
            guard !Task.isCancelled else { return }
            await reloadWindowed()
        }
    }

    private func scheduleDashboardReload() {
        dashboardReloadTask?.cancel()
        dashboardReloadTask = Task {
            try? await Task.sleep(for: .milliseconds(200))
            guard !Task.isCancelled else { return }
            await loadDashboard()
        }
    }

    func load(ledgerId: String) async {
        let ledgerChanged = self.ledgerId != ledgerId
        self.ledgerId = ledgerId
        if ledgerChanged {
            // Never let another ledger's budget card survive a switch whose
            // fresh fetch fails — hiding beats cross-ledger numbers. (The
            // dashboard keeps its keep-previous semantics; the budget card
            // has no back-compat to honor.)
            budget = nil
        }
        async let dash: () = loadDashboard()
        if ledgerChanged {
            async let trial: () = loadTrialBalance()
            async let statement: () = loadIncomeStatement()
            async let turnover: () = loadMemberTurnover()
            _ = await (dash, trial, statement, turnover)
        } else {
            await dash
        }
    }

    func reloadWindowed() async {
        guard ledgerId != nil else { return }
        async let trial: () = loadTrialBalance()
        async let statement: () = loadIncomeStatement()
        async let turnover: () = loadMemberTurnover()
        _ = await (trial, statement, turnover)
    }

    /// Refreshes every surface a posting can change: the dashboard cards
    /// (always month-to-date) and the windowed reports.
    func refreshAfterPosting() async {
        journalEpoch += 1
        async let dash: () = loadDashboard()
        async let windowed: () = reloadWindowed()
        _ = await (dash, windowed)
    }

    func loadDashboard() async {
        guard let ledgerId else { return }
        isLoadingDashboard = true
        defer { isLoadingDashboard = false }
        do {
            // Range filter with explicit UTC instants — the caller owns the
            // timezone math, same as the windowed reports.
            let window = dashboardMonth.map { AppDates.monthWindow(containing: $0.start) }
            let query = ApiQuery.build([
                ("from", window.map { ApiQuery.iso($0.from) }),
                ("to", window.map { ApiQuery.iso($0.to) }),
            ])
            // The budget card follows the dashboard's month exactly: the
            // server buckets by natural month under the device's offset, so
            // it needs year/month/offset instead of the dashboard's
            // from/to instants (which parse as UTC and mislabel local
            // month starts east of UTC).
            let month = dashboardMonth ?? AppDates.currentYearMonth
            async let dash: () = fetchDashboard(ledgerId, query)
            async let budgetReport: () = loadBudgetReport(
                ledgerId: ledgerId, month: month
            )
            // If the dashboard fetch throws, the catch keeps the previous
            // values — the budget may or may not have landed, same
            // keep-previous semantics either way.
            _ = try await (dash, budgetReport)
        } catch {
            // Keep whatever was loaded; the retry button reloads.
        }
    }

    private func fetchDashboard(_ ledgerId: String, _ query: String) async throws {
        dashboard = try await client.request(
            "GET",
            "bookkeeping/ledgers/\(ledgerId)/reports/dashboard\(query)"
        )
        // Publish the widget snapshot only when the fetched dashboard is
        // the current month — the widget always shows month-to-date, and
        // a user browsing an older month must not overwrite it.
        if dashboardMonth == nil || dashboardMonth == AppDates.currentYearMonth,
           let dashboard {
            WidgetDataStore.saveSnapshot(
                WidgetSnapshot(
                    ledgerId: ledgerId,
                    dashboard: dashboard,
                    month: dashboardMonth ?? AppDates.currentYearMonth
                )
            )
            WidgetSync.reloadTimelines()
        }
    }

    /// One budget report fetch; a failure keeps the previous report (guests
    /// 403 — callers gate the card the same way as the dashboard).
    private func loadBudgetReport(ledgerId: String, month: YearMonth) async {
        let query = ApiQuery.build([
            ("year", String(month.year)),
            ("month", String(month.month)),
            ("tzOffsetMinutes", String(AppDates.localTzOffsetMinutes)),
        ])
        budget = try? await client.request(
            "GET",
            "bookkeeping/ledgers/\(ledgerId)/reports/budget\(query)"
        )
    }

    /// Refetches just the budget report — after a budget settings write —
    /// so the dashboard card re-renders without reloading the dashboard.
    func refreshBudget() async {
        guard let ledgerId else { return }
        await loadBudgetReport(
            ledgerId: ledgerId,
            month: dashboardMonth ?? AppDates.currentYearMonth
        )
    }

    /// One-shot share-based summary for an explicit window (the journal's
    /// stat card): the dashboard endpoint takes from/to like the windowed
    /// reports, but nothing here touches the dashboard cards' published
    /// month state. nil on failure — guests 403 (callers gate the card),
    /// and a failed fetch just keeps the previous totals.
    func windowSummary(from: Date, to: Date) async -> Dashboard? {
        guard let ledgerId else { return nil }
        let query = ApiQuery.build([
            ("from", ApiQuery.iso(from)),
            ("to", ApiQuery.iso(AppDates.localEndOfDay(to))),
        ])
        return try? await client.request(
            "GET",
            "bookkeeping/ledgers/\(ledgerId)/reports/dashboard\(query)"
        )
    }

    func loadTrialBalance() async {
        guard let ledgerId else { return }
        isLoadingTrialBalance = true
        defer { isLoadingTrialBalance = false }
        do {
            let query = ApiQuery.build([
                ("to", toDate.map { ApiQuery.iso(AppDates.localEndOfDay($0)) }),
            ])
            trialBalance = try await client.request(
                "GET",
                "bookkeeping/ledgers/\(ledgerId)/reports/trial-balance\(query)"
            )
        } catch {
            trialBalance = nil
        }
    }

    func loadIncomeStatement() async {
        guard let ledgerId else { return }
        isLoadingStatement = true
        defer { isLoadingStatement = false }
        do {
            let query = ApiQuery.build([
                ("from", fromDate.map { ApiQuery.iso($0) }),
                ("to", toDate.map { ApiQuery.iso(AppDates.localEndOfDay($0)) }),
            ])
            incomeStatement = try await client.request(
                "GET",
                "bookkeeping/ledgers/\(ledgerId)/reports/income-statement\(query)"
            )
        } catch {
            incomeStatement = nil
        }
    }

    func loadMemberTurnover() async {
        guard let ledgerId else { return }
        isLoadingTurnover = true
        defer { isLoadingTurnover = false }
        do {
            let query = ApiQuery.build([
                ("from", fromDate.map { ApiQuery.iso($0) }),
                ("to", toDate.map { ApiQuery.iso(AppDates.localEndOfDay($0)) }),
            ])
            memberTurnover = try await client.request(
                "GET",
                "bookkeeping/ledgers/\(ledgerId)/reports/member-turnover\(query)"
            )
        } catch {
            memberTurnover = nil
        }
    }
}
