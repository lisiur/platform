//
//  StatsStore.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/19.
//

import Foundation
import Observation

/// The journal's structural filters a chart page carries, captured at
/// push time (the funnel sheet's picks). Deliberately absent: the search
/// text (a list mechanic, not a chart dimension) and the show/hide opt-out
/// toggle — a 不计收支 entry's amounts stay out of every stat the ledger
/// speaks, charts included, however the list displays it; that caliber is
/// pinned server-side. nil = the unfiltered ledger stats the dashboard tab
/// fetches: unchanged snapshot keys, and the widget-snapshot publish duty.
/// nonisolated — its members feed the pure key/query builders below, the
/// same convention as `MonthWindow`.
nonisolated struct StatsFilters: Hashable {
    var participantUserId: String?
    var projectId: String?

    /// Capture sites collapse empty filters to nil so an unfiltered chart
    /// page stays wire- and cache-identical to the dashboard tab's.
    var isEmpty: Bool { participantUserId == nil && projectId == nil }

    /// The aggregation's numerator, the journal day headers' rule: a
    /// project's books speak raw lines, the ledger speaks the members'
    /// split.
    var shareMode: ReportShareMode { projectId == nil ? .members : .line }

    /// The wire pairs appended beside the window pairs (`ReportPaths`).
    var queryPairs: [(String, String?)] {
        [
            ("participantUserId", participantUserId),
            ("projectId", projectId),
        ]
    }

    /// The cache-key segment that separates a filtered page's record from
    /// the ledger's unfiltered one — nil keeps the legacy key (and its
    /// already-persisted snapshots) valid for the unfiltered surfaces.
    /// Pure and nonisolated for tests.
    nonisolated static func keySegment(_ filters: StatsFilters?) -> String? {
        guard let filters, !filters.isEmpty else { return nil }
        return ApiQuery.build(
            filters.queryPairs + [("shareMode", filters.shareMode.rawValue)]
        )
    }
}

/// Windowed stats for one ledger: the overview totals (the dashboard
/// report), the per-day income/expense series, and the per-category
/// totals — the three payloads behind the stats component's cards,
/// fetched together over ANY local window (a month on the dashboard, a
/// week or custom range on a journal stats page), optionally scoped to
/// the journal's structural filters. Each surface owns its own instance
/// so two mounted stats windows (the dashboard tab alive behind a pushed
/// stats page) can never overwrite each other — the same per-surface-
/// store rule the drill-down's private `JournalStore` follows. Keep-
/// previous on failure like the old dashboard cards; a ledger switch
/// drops everything (stale charts from another ledger are worse than
/// blank ones). The widget's month-to-date snapshot duty rode here with
/// the overview fetch (out of `ReportStore`): a fetched window that IS
/// the current local month republishes the snapshot, so week/custom-
/// range totals can never masquerade as the widget's month figures and
/// browsing an older month doesn't overwrite it either — and a FILTERED
/// fetch never republishes at all (one participant's spend is not the
/// family's month-to-date).
@MainActor
@Observable
final class StatsStore {
    let client = APIClient.shared

    /// The window overview — the stat block's totals. nil renders the
    /// placeholders; a failed fetch keeps the previous window's figures.
    private(set) var overview: Dashboard?

    /// The trend/calendar cards' per-day series; nil keeps those cards
    /// hidden (the same data gate that hides them for guests, who never
    /// fetch — every report endpoint 403s them).
    private(set) var daily: [DayIncomeExpense]?

    /// The composition card's per-category totals; nil keeps it hidden.
    private(set) var categories: CategorySummaryResponse?

    private(set) var isLoading = false

    /// The window the published payloads describe. Set BEFORE the
    /// fetches await, so each fetch's post-await guard drops its own
    /// result when a newer load has already re-aimed the store — an
    /// out-of-order completion can't publish stale data.
    private(set) var window: MonthWindow?

    private var ledgerId: String?

    /// Fetches all three payloads for `window`, scoped to `filters` when
    /// the surface carries the journal's structural filters (nil = the
    /// dashboard tab's unfiltered ledger stats). The component's
    /// `.task(id:)` calls this on mount, window change, and every
    /// appearance — re-fetching on every appearance is the dashboard's
    /// established refresh rhythm, and `.task`'s restart coalesces rapid
    /// window stepping the way the old debounced reload did. A cold
    /// surface first hydrates the nil payloads from the snapshot cache,
    /// so a remounted stats page paints last-known figures instead of
    /// placeholders while the fetches below silently correct them.
    func load(
        ledgerId: String,
        window: MonthWindow,
        filters: StatsFilters? = nil
    ) async {
        let ledgerChanged = self.ledgerId != ledgerId
        if ledgerChanged {
            overview = nil
            daily = nil
            categories = nil
        }
        self.ledgerId = ledgerId
        self.window = window
        hydrate(ledgerId: ledgerId, window: window, filters: filters)
        isLoading = true
        defer { isLoading = false }
        async let overview: () = loadOverview(
            ledgerId: ledgerId, window: window, filters: filters
        )
        async let daily: () = loadDaily(
            ledgerId: ledgerId, window: window, filters: filters
        )
        async let categories: () = loadCategories(
            ledgerId: ledgerId, window: window, filters: filters
        )
        _ = await (overview, daily, categories)
    }

    // MARK: snapshot cache

    /// The stats component's snapshot-cache binding — namespace and schema
    /// version live here, not at every call site. Bump `schema` when
    /// `StatsSnapshot`'s shape changes incompatibly.
    private static let cache = SnapshotCache.namespace("stats", schema: 1)

    /// The stats payloads as one cache record.
    private struct StatsSnapshot: Codable {
        var overview: Dashboard? = nil
        var daily: [DayIncomeExpense]? = nil
        var categories: CategorySummaryResponse? = nil
    }

    /// The cache key: ledger + window bounds, plus a filters segment when
    /// the surface carries the journal's structural filters — a
    /// participant-scoped chart must never read or poison the ledger's
    /// record. The unfiltered key is unchanged (the dashboard tab's cold
    /// mounts rehydrate its persisted snapshots). Pure and nonisolated
    /// for tests.
    nonisolated static func snapshotKey(
        ledgerId: String,
        window: MonthWindow,
        filters: StatsFilters?
    ) -> String {
        var tokens = [
            ledgerId,
            SnapshotCache.epochOrAll(window.from),
            SnapshotCache.epochOrAll(window.to),
        ]
        if let segment = StatsFilters.keySegment(filters) {
            tokens.append(segment)
        }
        return SnapshotCache.makeKey(tokens)
    }

    /// Fills only the payload fields that are nil — a cold mount hydrates
    /// everything, a re-appearance after a partial failure tops up just the
    /// gap. The record for a window only ever holds data fetched FOR that
    /// window (each fetch merges its own result), so a keep-previous
    /// failure can't bleed one window's figures into another's key. Never
    /// publishes the widget snapshot: that duty belongs to real fetches
    /// (`loadOverview`), a cache hit must not pose as one. Surfaces that
    /// never fetch (guests) never reach `load`, so they never hydrate.
    private func hydrate(
        ledgerId: String, window: MonthWindow, filters: StatsFilters?
    ) {
        guard overview == nil || daily == nil || categories == nil else { return }
        guard
            let snapshot: StatsSnapshot = Self.cache.read(
                key: Self.snapshotKey(
                    ledgerId: ledgerId, window: window, filters: filters
                ),
                as: StatsSnapshot.self
            )
        else { return }
        if overview == nil, let cached = snapshot.overview { self.overview = cached }
        if daily == nil, let cached = snapshot.daily { self.daily = cached }
        if categories == nil, let cached = snapshot.categories { self.categories = cached }
    }

    /// Merges one fetch's payload into the window's cached record.
    /// Read-modify-write with no await in between: the three concurrent
    /// fetches serialize on the MainActor, so neither merge can drop the
    /// others' fields. A fetch that failed simply never calls this — the
    /// record keeps that field's last-known-good value.
    private func mergeIntoCache(
        ledgerId: String,
        window: MonthWindow,
        filters: StatsFilters?,
        update: (inout StatsSnapshot) -> Void
    ) {
        let key = Self.snapshotKey(
            ledgerId: ledgerId, window: window, filters: filters
        )
        var snapshot = Self.cache.read(key: key, as: StatsSnapshot.self) ?? StatsSnapshot()
        update(&snapshot)
        Self.cache.write(key: key, payload: snapshot)
    }

    /// The three fetches' shared shape. The window pairs and the caller's
    /// filters + numerator come from `baseQueryPairs` — the one place a
    /// stats query's scope is shaped (ReportPaths owns the range, so a
    /// payload can never silently lose it again — a dropped pair once
    /// shipped the composition card as all-time totals) — then the
    /// endpoint is requested, the result dropped when a newer load has
    /// re-aimed the store or the task was cancelled, published, and the
    /// previous payload kept on failure (the next reload retries).
    /// `publish` runs on the store's actor only after the staleness guard.
    private func fetch<P: Decodable>(
        _ endpoint: String,
        ledgerId: String,
        window: MonthWindow,
        filters: StatsFilters?,
        query: [(String, String?)] = [],
        publish: (P) -> Void
    ) async {
        let path = "bookkeeping/ledgers/\(ledgerId)/reports/\(endpoint)"
            + ApiQuery.build(
                Self.baseQueryPairs(window: window, filters: filters) + query
            )
        do {
            let payload: P = try await client.request("GET", path)
            guard isCurrent(window), !Task.isCancelled else { return }
            publish(payload)
        } catch {
            // Keep the previous window's payload; the next reload retries.
        }
    }

    /// The wire pairs every stats request carries beside its endpoint
    /// extras: the window, then the caller's filters and numerator. The
    /// unfiltered shape is the shipped one — window + `shareMode=members`
    /// — with one deliberate delta: the overview fetch now also declares
    /// its numerator (the server's default anyway, matching the
    /// every-caller-declares convention), so the daily/category requests
    /// are the byte-identical ones. Pure and nonisolated for tests.
    nonisolated static func baseQueryPairs(
        window: MonthWindow, filters: StatsFilters?
    ) -> [(String, String?)] {
        ReportPaths.windowPairs(window)
            + [
                ("shareMode", (filters?.shareMode ?? .members).rawValue)
            ]
            + (filters?.queryPairs ?? [])
    }

    /// The overview fetch. On success the widget snapshot duty runs (see
    /// `WidgetSnapshotSync` for the current-month rule) — unfiltered
    /// fetches only: a participant- or project-scoped page's figures are
    /// not the family's month-to-date, so they must never republish.
    private func loadOverview(
        ledgerId: String, window: MonthWindow, filters: StatsFilters?
    ) async {
        await fetch(
            "dashboard", ledgerId: ledgerId, window: window, filters: filters
        ) { (dashboard: Dashboard) in
            overview = dashboard
            if filters?.isEmpty ?? true {
                WidgetSnapshotSync.publishIfCurrentMonth(
                    dashboard, ledgerId: ledgerId, window: window
                )
            }
            mergeIntoCache(
                ledgerId: ledgerId, window: window, filters: filters
            ) { $0.overview = dashboard }
        }
    }

    /// The daily-summary fetch — the trend card's numerator, matching the
    /// stat block; `tzOffsetMinutes` is the day bucketing.
    private func loadDaily(
        ledgerId: String, window: MonthWindow, filters: StatsFilters?
    ) async {
        await fetch(
            "daily-summary", ledgerId: ledgerId, window: window,
            filters: filters,
            query: [
                ("tzOffsetMinutes", String(AppDates.localTzOffsetMinutes)),
            ]
        ) { (response: DailySummaryResponse) in
            daily = response.days
            mergeIntoCache(
                ledgerId: ledgerId, window: window, filters: filters
            ) { $0.daily = response.days }
        }
    }

    /// The category-summary fetch — the daily summary's numerator keyed
    /// per account, so the composition card reconciles with the trend
    /// card beside it.
    private func loadCategories(
        ledgerId: String, window: MonthWindow, filters: StatsFilters?
    ) async {
        await fetch(
            "category-summary", ledgerId: ledgerId, window: window,
            filters: filters
        ) { (summary: CategorySummaryResponse) in
            categories = summary
            mergeIntoCache(
                ledgerId: ledgerId, window: window, filters: filters
            ) { $0.categories = summary }
        }
    }

    /// Whether `window` is still the load the store is aimed at.
    private func isCurrent(_ window: MonthWindow) -> Bool {
        self.window == window
    }
}

/// Which (ledger, window) pairs a live stats surface is fetching right
/// now — the posting path consults this before its own widget snapshot
/// fetch: a mounted stats component aimed at the current month refetches
/// on the same epoch bump the post raised and republishes the snapshot
/// itself, so a second dashboard fetch there would only duplicate the
/// request. Surfaces register on appear and unregister on disappear
/// (refcounted — two surfaces may aim at one window); a surface that
/// never fetches (guests) never registers, and a surface aimed at any
/// other window doesn't cover the snapshot's current-month duty, so the
/// post path still fetches in both cases.
@MainActor
enum StatsSurfaceWatch {
    private static var counts: [String: Int] = [:]

    private static func key(ledgerId: String, window: MonthWindow) -> String {
        "\(ledgerId)|\(window.from.timeIntervalSince1970)|\(window.to.timeIntervalSince1970)"
    }

    static func register(ledgerId: String, window: MonthWindow) {
        counts[key(ledgerId: ledgerId, window: window), default: 0] += 1
    }

    static func unregister(ledgerId: String, window: MonthWindow) {
        let key = key(ledgerId: ledgerId, window: window)
        guard let count = counts[key] else { return }
        if count <= 1 {
            counts.removeValue(forKey: key)
        } else {
            counts[key] = count - 1
        }
    }

    static func isLive(ledgerId: String, window: MonthWindow) -> Bool {
        (counts[key(ledgerId: ledgerId, window: window)] ?? 0) > 0
    }
}
