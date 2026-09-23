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
/// text (a list mechanic, not a chart dimension). The isolating toggles
/// ride as narrow-the-set axes: 不计预算 via `excludedFromBudget`, 不计收支
/// via `countsInLedger=false` — the server lifts its ledger-activity
/// predicate whenever the countsInLedger axis is present, so no caller
/// needs an includeExcluded ride-along. The budget opt-out counts in the
/// ledger stats by default, so isolating it is a real narrowing the cards
/// must follow to reconcile with the funnel-filtered list. The account
/// axes (`accountId`/`parentAccountId`) are the drill-down pages'
/// structural scope — no funnel writes them, only a drill's seeding does,
/// so a chart page pushed FROM a drill inherits the category and its
/// donut buckets that category's children (the server's report endpoints
/// have carried both axes since a3d255bb). nil = the unfiltered ledger
/// stats the dashboard tab fetches: unchanged snapshot keys, and the
/// widget-snapshot publish duty. nonisolated — its members feed the pure
/// key/query builders below, the same convention as `MonthWindow`.
nonisolated struct StatsFilters: Hashable {
    var participantUserId: String? = nil
    var projectId: String? = nil
    /// true = only entries marked 不计入日常预算 (the funnel's 只看不计预算
    /// toggle); nil = no budget filtering.
    var budgetExcluded: Bool? = nil
    /// true = only entries recorded 不计收支 (the funnel's 只看不计收支
    /// toggle); nil = no not-counted filtering.
    var notCountedOnly: Bool? = nil
    /// The kind pick (the funnel's 全部/支出/收入): the window's totals
    /// narrow to entries classified that way — the same server
    /// classification the list rows render by. nil = every kind
    /// (transfer included).
    var kind: QuickEntryKind? = nil
    /// The drill page's leaf-category scope (the composition card's leaf
    /// row). Entry-level filtering: other lines on a matched entry also
    /// feed the category buckets.
    var accountId: String? = nil
    /// The drill page's rollup-category scope (a 一级分类 bucket) — the
    /// server matches the parent OR any of its children, so a chart
    /// page's donut buckets the category's children.
    var parentAccountId: String? = nil
    /// Display-only: the category NAME for the account axes above, so a
    /// page that inherits its category through `filters` (a day drill
    /// from a category-scoped chart page) can title itself without
    /// looking the id up — the same rule `JournalDrillDown.categoryLabel`
    /// serves for drills that carry their own axes. Deliberately outside
    /// `queryPairs`, `isEmpty`, and therefore every cache key: captures
    /// differing only in label are the same wire shape (they still
    /// compare unequal, which at worst costs one same-shaped refetch).
    var categoryLabel: String? = nil

    /// Capture sites collapse empty filters to nil so an unfiltered chart
    /// page stays wire- and cache-identical to the dashboard tab's.
    var isEmpty: Bool {
        participantUserId == nil && projectId == nil
            && budgetExcluded == nil && notCountedOnly == nil && kind == nil
            && accountId == nil && parentAccountId == nil
    }

    /// The aggregation's numerator, the journal day headers' rule: a
    /// project's books speak raw lines, the ledger speaks the members'
    /// split.
    var shareMode: ReportShareMode { projectId == nil ? .members : .line }

    /// The wire pairs appended beside the window pairs (`ReportPaths`).
    var queryPairs: [(String, String?)] {
        [
            ("participantUserId", participantUserId),
            ("projectId", projectId),
            ("excludedFromBudget", budgetExcluded.map { $0 ? "true" : "false" }),
            ("countsInLedger", notCountedOnly == true ? "false" : nil),
            ("kind", kind?.rawValue),
            ("accountId", accountId),
            ("parentAccountId", parentAccountId),
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

    /// Returns a copy carrying the display-only category label (see
    /// `categoryLabel`) — the store capture knows ids only; the drill
    /// page's chart push attaches the name its payload carries.
    func withCategoryLabel(_ label: String?) -> StatsFilters {
        var copy = self
        copy.categoryLabel = label
        return copy
    }
}

/// The store's structural filters as one stats capture — the read every
/// host surface (dashboard, journal, stats tab) shares, so a new axis
/// lands here and nowhere else. The search stays out (a list mechanic);
/// every axis the funnel sheet offers now isolates a set the cards must
/// reconcile with, and the drill axes ride too — only a drill-down's
/// private store ever has `accountId`/`parentAccountId` set (the shared
/// journal/dashboard stores have no UI for them), so a chart page pushed
/// from a drill inherits the category while every other surface's
/// capture is unchanged. An empty capture collapses to nil so an
/// unfiltered surface stays wire- and cache-identical to the dashboard
/// tab's.
extension JournalStore {
    var statsFilters: StatsFilters? {
        let filters = StatsFilters(
            participantUserId: participantUserId,
            projectId: projectFilterId,
            budgetExcluded: budgetExcluded,
            notCountedOnly: notCountedOnly ? true : nil,
            kind: kind,
            accountId: accountId,
            parentAccountId: parentAccountId
        )
        return filters.isEmpty ? nil : filters
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

    /// The filters the published payloads describe — the staleness guard's
    /// third axis: two loads sharing a ledger and window but differing in
    /// filters (the funnel's toggles flip them) must not let an in-flight
    /// response shaped for the old shape publish over the newer aim.
    private var filters: StatsFilters?

    /// The default empty store — the pushed surfaces (month view, chart
    /// page) and the tests. Their cold hydrate runs in the task-driven
    /// `load`, one frame or more after first render; a push transition
    /// covers that gap.
    init() {}

    /// The dashboard's cold-start seed — rehydrates at STORE CREATION,
    /// before any view renders, so the launch tab's stat block never
    /// flashes its placeholders. A `@State` store initializes before the
    /// page knows its ledger, so the LEDGER comes from the "last" meta
    /// record (refreshed by every successful field merge below), while
    /// the window and filters stay the caller's own: the seed always
    /// reads the record THIS surface will fetch, never another window's
    /// figures. Opt-in for exactly that reason — a private drill store
    /// seeded from "last" could paint a foreign window.
    ///
    /// Two honest caveats. The seed itself is ungated: a guest's store
    /// may hydrate payloads it never renders (guests land in project
    /// scope, pass `isReportingEnabled: false`, and the guest task never
    /// fetches), so `hydrate`'s "guests never reach load" invariant
    /// describes the fetch path only. And "last" is refreshed by every
    /// surface's merges, so when the active ledger differs from the meta
    /// one the first frame carries that ledger's figures until the fetch
    /// corrects — the same fetch-always-follows rule as every cache seed.
    init(seedLastLedger: Bool, window: MonthWindow, filters: StatsFilters?) {
        guard seedLastLedger,
              let meta: LastStatsMeta = Self.cache.read(key: Self.lastKey, as: LastStatsMeta.self)
        else { return }
        hydrate(ledgerId: meta.ledgerId, window: window, filters: filters)
        ledgerId = meta.ledgerId
        self.window = window
    }

    /// Fetches the window's payloads for `ledgerId`, scoped to `filters`
    /// when the surface carries the journal's structural filters (nil = the
    /// dashboard tab's unfiltered ledger stats). `includesDaily: false`
    /// skips the per-day series — a surface that mounts neither the
    /// calendar nor the trend chart (the dashboard's overview-only block).
    /// `includesCategories: false` skips the per-category totals — a
    /// surface that doesn't mount the
    /// composition card. A skipped payload's record field simply keeps
    /// whatever earlier fetches last merged. The component's
    /// `.task(id:)` calls this on mount, window change, and every
    /// appearance — re-fetching on every appearance is the dashboard's
    /// established refresh rhythm, and `.task`'s restart coalesces rapid
    /// window stepping the way the old debounced reload did. A cold
    /// surface first hydrates the nil payloads from the snapshot cache,
    /// so a remounted stats page paints last-known figures instead of
    /// placeholders while the fetches below silently correct them. (The
    /// dashboard's store seeds earlier still — at creation, via
    /// `init(seedLastLedger:window:filters:)` — so the launch tab never
    /// paints placeholders at all.)
    func load(
        ledgerId: String,
        window: MonthWindow,
        filters: StatsFilters? = nil,
        includesDaily: Bool = true,
        includesCategories: Bool = true
    ) async {
        let ledgerChanged = self.ledgerId != ledgerId
        if ledgerChanged {
            overview = nil
            daily = nil
            categories = nil
        }
        self.ledgerId = ledgerId
        self.window = window
        self.filters = filters
        hydrate(ledgerId: ledgerId, window: window, filters: filters)
        isLoading = true
        defer { isLoading = false }
        async let overview: () = loadOverview(
            ledgerId: ledgerId, window: window, filters: filters
        )
        if includesDaily, includesCategories {
            async let daily: () = loadDaily(
                ledgerId: ledgerId, window: window, filters: filters
            )
            async let categories: () = loadCategories(
                ledgerId: ledgerId, window: window, filters: filters
            )
            _ = await (overview, daily, categories)
        } else if includesDaily {
            async let daily: () = loadDaily(
                ledgerId: ledgerId, window: window, filters: filters
            )
            _ = await (overview, daily)
        } else if includesCategories {
            async let categories: () = loadCategories(
                ledgerId: ledgerId, window: window, filters: filters
            )
            _ = await (overview, categories)
        } else {
            _ = await overview
        }
    }

    // MARK: snapshot cache

    /// The stats component's snapshot-cache binding — namespace and schema
    /// version live here, not at every call site. Bump `schema` when
    /// `StatsSnapshot`'s shape changes incompatibly.
    private static let cache = SnapshotCache.namespace("stats", schema: 1)

    /// The key under which the last successful merge's ledger rides — the
    /// pointer the dashboard's seeding initializer needs, since a `@State`
    /// store is created before its page knows which ledger is active.
    private static let lastKey = "last"

    /// The "last" record's payload.
    private struct LastStatsMeta: Codable {
        var ledgerId: String
    }

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
        var tokens = SnapshotCache.ledgerWindowTokens(
            ledgerId: ledgerId, from: window.from, to: window.to
        )
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
        Self.cache.write(key: Self.lastKey, payload: LastStatsMeta(ledgerId: ledgerId))
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
            // Both aim fields gate the publish — a ledger switch aimed at
            // an identical window must drop the old ledger's in-flight
            // response, or the doc's stale-data promise below is a lie.
            // All three aim fields gate the publish: a ledger switch, a
            // window step, or a filter flip must drop an in-flight
            // response shaped for the old aim — same-window/different-
            // filters is a real toggle race (RangeTotalsStore guards the
            // same way).
            guard
                self.ledgerId == ledgerId,
                self.window == window,
                self.filters == filters,
                !Task.isCancelled
            else { return }
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

    /// The daily-summary GET path for one window — the one composition
    /// of the endpoint, the window/filters pairs, and the day bucketing.
    /// `loadDaily` fetches the same shape through `fetch`'s parameter-
    /// ization; the dashboard's range card store reuses this builder
    /// rather than re-deriving it.
    nonisolated static func dailySummaryPath(
        ledgerId: String, window: MonthWindow, filters: StatsFilters?
    ) -> String {
        "bookkeeping/ledgers/\(ledgerId)/reports/daily-summary"
            + ApiQuery.build(
                baseQueryPairs(window: window, filters: filters)
                    + [("tzOffsetMinutes", String(AppDates.localTzOffsetMinutes))]
            )
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
