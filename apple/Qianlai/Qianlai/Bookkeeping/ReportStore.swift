//
//  ReportStore.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import Foundation
import Observation

/// Ledger reports: the budget card, trial balance, income statement, and
/// member turnover, all scoped to the active ledger and an optional date
/// window (from/to). The stats component's payloads (overview totals,
/// daily summary, category summary) moved to `StatsStore` — one windowed
/// instance per mounted stats surface.
@MainActor
@Observable
final class ReportStore {
    let client = APIClient.shared

    /// The snapshot-cache binding — every report payload persists under
    /// its own query signature (see the key builders below), so a window
    /// or month change can never read another window's record.
    private static let cache = SnapshotCache.namespace("reports", schema: 1)

    /// The budget record's key: ledger + summarized month. Pure and
    /// nonisolated for tests.
    nonisolated static func budgetKey(ledgerId: String, month: YearMonth) -> String {
        SnapshotCache.makeKey(["budget", ledgerId, String(month.year), String(month.month)])
    }

    /// A windowed report's key: ledger + the exact window the request
    /// carries (nil bounds = the all-time request). Pure and nonisolated
    /// for tests.
    nonisolated static func windowKey(
        _ name: String, ledgerId: String, from: Date?, to: Date?
    ) -> String {
        SnapshotCache.makeKey([
            name,
            ledgerId,
            SnapshotCache.epochOrAll(from),
            SnapshotCache.epochOrAll(to),
        ])
    }

    /// The one cached-report load: hydrate the surface from `key` when
    /// empty, fetch, publish, persist on success, clear on failure — the
    /// four report loads share this shape, and `assign`/`clear` touch the
    /// caller's own property. Failure clears, the reports' established
    /// semantics; a cold surface paints its cached report first and the
    /// fetch silently corrects it.
    private func loadCached<P: Codable>(
        path: String,
        key: String,
        as type: P.Type,
        isEmpty: () -> Bool,
        assign: (P) -> Void,
        clear: () -> Void
    ) async {
        if isEmpty(), let cached: P = Self.cache.read(key: key, as: type) {
            assign(cached)
        }
        do {
            let loaded: P = try await client.request("GET", path)
            assign(loaded)
            Self.cache.write(key: key, payload: loaded)
        } catch {
            clear()
        }
    }

    /// The budget card's payload for `budgetMonth` — nil until the first
    /// successful fetch, and stale-safe on failure (the last report stays
    /// published, matching the dashboard's keep-previous behavior). Also
    /// feeds the quick entry's toggle default (`excludedAccountIds`).
    private(set) var budget: BudgetReport?

    /// Month the budget card summarizes; nil follows the current month
    /// (server default). Writing it schedules a coalesced budget reload,
    /// so `refreshAfterPosting` and the month stepper re-summarize the
    /// budget on screen. (The stats cards re-aim through their own
    /// `StatsStore` windows.)
    var budgetMonth: YearMonth? {
        didSet {
            // Observable writes notify even when the value is unchanged;
            // without the guard every re-assignment would schedule another
            // budget request.
            guard budgetMonth != oldValue else { return }
            scheduleBudgetReload()
        }
    }
    private var budgetReloadTask: Task<Void, Never>?

    /// The month every budget fetch in this store summarizes — nil
    /// `budgetMonth` follows the current month. One fallback expression
    /// so the fetch sites can't drift.
    private var effectiveBudgetMonth: YearMonth {
        budgetMonth ?? AppDates.currentYearMonth
    }

    /// Writes the month without arming the didSet reload — the dashboard
    /// task fetches immediately after, so the debounced reload would only
    /// duplicate the request. Any pending debounced reload is cancelled for
    /// the same reason.
    func setBudgetMonthSilently(_ month: YearMonth?) {
        budgetReloadTask?.cancel()
        budgetReloadTask = nil
        budgetMonth = month
    }

    /// Bumped by `refreshAfterPosting` after every post/update/delete so
    /// surfaces holding their own store (the stats cards' `StatsStore`,
    /// the journal's stat card) can refetch without sharing state here.
    private(set) var journalEpoch = 0

    private(set) var trialBalance: TrialBalance?
    private(set) var isLoadingTrialBalance = false

    private(set) var incomeStatement: IncomeStatement?
    private(set) var isLoadingStatement = false

    private(set) var memberTurnover: MemberTurnover?
    private(set) var isLoadingTurnover = false

    private var ledgerId: String?

    var fromDate: Date? { didSet { scheduleWindowedReload() } }
    var toDate: Date? { didSet { scheduleWindowedReload() } }

    /// Coalesces preset commits (both bounds write back-to-back) into one
    /// windowed refresh instead of two overlapping ones.
    private var reloadTask: Task<Void, Never>?

    private func scheduleWindowedReload() {
        reloadTask?.cancel()
        reloadTask = Task {
            try? await Task.sleep(for: ReloadDebounce.interval)
            guard !Task.isCancelled else { return }
            await reloadWindowed()
        }
    }

    /// Coalesces budget month writes into one budget fetch.
    private func scheduleBudgetReload() {
        budgetReloadTask?.cancel()
        budgetReloadTask = Task {
            try? await Task.sleep(for: ReloadDebounce.interval)
            guard !Task.isCancelled, let ledgerId else { return }
            await loadBudgetReport(ledgerId: ledgerId, month: effectiveBudgetMonth)
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
            async let trial: () = loadTrialBalance()
            async let statement: () = loadIncomeStatement()
            async let turnover: () = loadMemberTurnover()
            async let budget: () = loadBudgetReport(
                ledgerId: ledgerId, month: effectiveBudgetMonth
            )
            _ = await (trial, statement, turnover, budget)
        } else {
            await loadBudgetReport(
                ledgerId: ledgerId, month: effectiveBudgetMonth
            )
        }
    }

    func reloadWindowed() async {
        guard ledgerId != nil else { return }
        async let trial: () = loadTrialBalance()
        async let statement: () = loadIncomeStatement()
        async let turnover: () = loadMemberTurnover()
        _ = await (trial, statement, turnover)
    }

    /// Refreshes every surface a posting can change: the budget card (the
    /// dashboard's month-to-date spend), the windowed reports, and the
    /// widget's month snapshot. The stats cards ride the `journalEpoch`
    /// bump — they hold their own `StatsStore` and refetch on its change.
    func refreshAfterPosting() async {
        journalEpoch += 1
        guard let ledgerId else {
            await reloadWindowed()
            return
        }
        async let budget: () = loadBudgetReport(
            ledgerId: ledgerId, month: effectiveBudgetMonth
        )
        async let windowed: () = reloadWindowed()
        async let snapshot: () = refreshWidgetSnapshot(ledgerId: ledgerId)
        _ = await (budget, windowed, snapshot)
    }

    /// The widget snapshot's post-path refresh. The stats cards only
    /// republish when mounted, but a post from the journal before the
    /// dashboard's first visit this session must still hand the widget
    /// fresh month-to-date totals — the old `loadDashboard` did this on
    /// every post. One dashboard fetch over the CURRENT month's window;
    /// the publisher no-ops for any other window (which this can't be).
    /// Skipped when a live stats surface is aimed at exactly this window:
    /// it refetches on the epoch bump this post raised and republishes
    /// the snapshot itself, so a second fetch would only duplicate the
    /// request (see `StatsSurfaceWatch`).
    private func refreshWidgetSnapshot(ledgerId: String) async {
        let window = AppDates.monthWindow(containing: Date())
        guard !StatsSurfaceWatch.isLive(ledgerId: ledgerId, window: window) else { return }
        if let dashboard: Dashboard = try? await client.request(
            "GET",
            ReportPaths.dashboard(ledgerId: ledgerId, window: window)
        ) {
            WidgetSnapshotSync.publishIfCurrentMonth(dashboard, ledgerId: ledgerId, window: window)
        }
    }

    /// One budget report fetch; a failure clears the card (guests 403 —
    /// callers gate the card the same way as the dashboard).
    private func loadBudgetReport(ledgerId: String, month: YearMonth) async {
        await loadCached(
            path: "bookkeeping/ledgers/\(ledgerId)/reports/budget" + ApiQuery.build([
                ("year", String(month.year)),
                ("month", String(month.month)),
                ("tzOffsetMinutes", String(AppDates.localTzOffsetMinutes)),
            ]),
            key: Self.budgetKey(ledgerId: ledgerId, month: month),
            as: BudgetReport.self,
            isEmpty: { budget == nil },
            assign: { budget = $0 },
            clear: { budget = nil }
        )
    }

    /// Refetches just the budget report — after a budget settings write —
    /// so the dashboard card re-renders without reloading the dashboard.
    func refreshBudget() async {
        guard let ledgerId else { return }
        await loadBudgetReport(
            ledgerId: ledgerId,
            month: effectiveBudgetMonth
        )
    }

    /// One-shot share-based summary for an explicit window (the journal's
    /// stat card), optionally scoped to the journal's structural filters —
    /// a filtered window's totals then describe exactly the list's rows.
    /// The dashboard endpoint takes from/to like the windowed reports, but
    /// nothing here touches the published state. nil on failure — guests
    /// 403 (callers gate the card), and a failed fetch just keeps the
    /// previous totals.
    func windowSummary(
        from: Date,
        to: Date,
        filters: StatsFilters? = nil
    ) async -> Dashboard? {
        guard let ledgerId else { return nil }
        var pairs: [(String, String?)] = [
            ("from", ApiQuery.iso(from)),
            ("to", ApiQuery.iso(AppDates.localEndOfDay(to))),
        ]
        if let filters, !filters.isEmpty {
            pairs += filters.queryPairs
            pairs.append(("shareMode", filters.shareMode.rawValue))
        }
        let query = ApiQuery.build(pairs)
        return try? await client.request(
            "GET",
            "bookkeeping/ledgers/\(ledgerId)/reports/dashboard\(query)"
        )
    }

    func loadTrialBalance() async {
        guard let ledgerId else { return }
        isLoadingTrialBalance = true
        defer { isLoadingTrialBalance = false }
        await loadCached(
            path: "bookkeeping/ledgers/\(ledgerId)/reports/trial-balance" + ApiQuery.build([
                ("to", toDate.map { ApiQuery.iso(AppDates.localEndOfDay($0)) }),
            ]),
            key: Self.windowKey("trial", ledgerId: ledgerId, from: nil, to: toDate),
            as: TrialBalance.self,
            isEmpty: { trialBalance == nil },
            assign: { trialBalance = $0 },
            clear: { trialBalance = nil }
        )
    }

    func loadIncomeStatement() async {
        guard let ledgerId else { return }
        isLoadingStatement = true
        defer { isLoadingStatement = false }
        await loadCached(
            path: "bookkeeping/ledgers/\(ledgerId)/reports/income-statement" + ApiQuery.build([
                ("from", fromDate.map { ApiQuery.iso($0) }),
                ("to", toDate.map { ApiQuery.iso(AppDates.localEndOfDay($0)) }),
            ]),
            key: Self.windowKey("statement", ledgerId: ledgerId, from: fromDate, to: toDate),
            as: IncomeStatement.self,
            isEmpty: { incomeStatement == nil },
            assign: { incomeStatement = $0 },
            clear: { incomeStatement = nil }
        )
    }

    func loadMemberTurnover() async {
        guard let ledgerId else { return }
        isLoadingTurnover = true
        defer { isLoadingTurnover = false }
        await loadCached(
            path: "bookkeeping/ledgers/\(ledgerId)/reports/member-turnover" + ApiQuery.build([
                ("from", fromDate.map { ApiQuery.iso($0) }),
                ("to", toDate.map { ApiQuery.iso(AppDates.localEndOfDay($0)) }),
            ]),
            key: Self.windowKey("turnover", ledgerId: ledgerId, from: fromDate, to: toDate),
            as: MemberTurnover.self,
            isEmpty: { memberTurnover == nil },
            assign: { memberTurnover = $0 },
            clear: { memberTurnover = nil }
        )
    }
}
