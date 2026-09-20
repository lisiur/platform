//
//  JournalStore.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import Foundation
import Observation

/// The ledger's entry date extent under the current filters — the All
/// tab's from/to display.
struct EntryDateBounds: Equatable, Codable {
    let earliest: Date
    let latest: Date
}

/// Journal entries for the active ledger: paginated list with search, date
/// range, and participant filters, plus quick-entry posting and deletion.
@MainActor
@Observable
final class JournalStore {
    static let pageSize = 20

    /// Server pagination cap: the entries route validates limit ≤ 100
    /// (zod `.max(100)` — a larger limit is a 400, not a silent clamp), so
    /// a loaded-window refresh walks the window in pages of at most this.
    static let requestPageSizeCap = 100

    /// List ordering. `.date` (default) is the server's newest-first order;
    /// the amount modes ask the server to order entries by their gross total
    /// (the sum of line debits) so offset pagination stays consistent —
    /// sorting client-side would only reorder the loaded pages.
    enum EntrySort: Hashable {
        case date
        case amountDescending
        case amountAscending
    }

    let client = APIClient.shared

    private(set) var entries: [JournalEntry] = []
    private(set) var total = 0
    private(set) var isLoading = false
    private(set) var isLoadingMore = false
    private(set) var loadError: String?
    private(set) var ledgerId: String?
    /// True once the first reload succeeded. Background refetches afterwards
    /// must keep the current content (rows or empty state) on screen instead
    /// of swapping in a blocking spinner — that swap was flashing the empty
    /// state and bouncing the layout under the search bar. A failed or
    /// cancelled first load leaves this false so the retry announces itself.
    private(set) var hasLoadedOnce = false

    /// Earliest/latest entry dates under the current filters (the All tab's
    /// from/to display) — refreshed beside every reload, never awaited by
    /// the list.
    private(set) var entryBounds: EntryDateBounds?
    private var boundsTask: Task<Void, Never>?

    /// Per-day income/expense totals keyed by the server's "yyyy-MM-dd" day
    /// string (see `dayKey`) — the date-section headers' right side. Like
    /// `entryBounds`: refreshed beside every reload, never awaited by the
    /// list, and describing the WHOLE filtered set (a header total never
    /// depends on how many of the day's rows have loaded).
    private(set) var dayTotals: [String: DayIncomeExpense] = [:]
    private var dayTotalsTask: Task<Void, Never>?

    /// Filter didSets skip same-value writes: a pushed drill-down page's
    /// `.task` re-runs on pop-back and re-assigns its scope filters, and a
    /// redundant reload there would fetch page 1 over the accumulated
    /// pages — collapsing the list under the restored scroll position.
    var searchQuery = "" { didSet { guard !suppressReload, oldValue != searchQuery else { return }; scheduleReload() } }
    var fromDate: Date? { didSet { guard !suppressReload, oldValue != fromDate else { return }; scheduleReload() } }
    var toDate: Date? { didSet { guard !suppressReload, oldValue != toDate else { return }; scheduleReload() } }
    /// Participant filter: the tagged user's id (`EntryPerson.id`), not the
    /// ledger-member row id — the server matches participant userIds.
    var participantUserId: String? { didSet { guard !suppressReload, oldValue != participantUserId else { return }; scheduleReload() } }
    var projectFilterId: String? { didSet { guard !suppressReload, oldValue != projectFilterId else { return }; scheduleReload() } }
    /// Category drill-down: only entries with a line against this account.
    var accountId: String? { didSet { guard !suppressReload, oldValue != accountId else { return }; scheduleReload() } }
    /// Top-level category rollup drill-down: only entries with a line
    /// against this account id OR against an account under it (the
    /// composition card's 一级分类 buckets).
    var parentAccountId: String? { didSet { guard !suppressReload, oldValue != parentAccountId else { return }; scheduleReload() } }
    /// Statement flow drill-down: only entries with a line against an
    /// account of this type (expense vs income totals).
    var accountType: String? { didSet { guard !suppressReload, oldValue != accountType else { return }; scheduleReload() } }
    /// Settlement drill-down: entries that involve this user — paid for by
    /// them, tagged with them, or untagged (split across all members).
    /// Creation alone doesn't qualify: it carries no settlement weight, so
    /// a created-only entry would render an all-zero row.
    var memberUserId: String? { didSet { guard !suppressReload, oldValue != memberUserId else { return }; scheduleReload() } }
    /// Entry-kind filter (the dashboard's month-header menu): classified
    /// the way rows render them — an expense line makes the entry an
    /// expense, otherwise an income line makes it income, otherwise it is
    /// a transfer. nil lists every kind.
    var kind: QuickEntryKind? { didSet { guard !suppressReload, oldValue != kind else { return }; scheduleReload() } }
    /// Budget-flag drill axis (the budget card's two drill-downs): true
    /// lists only entries marked 不计入预算, false only entries the budget
    /// counts (日常已花). nil lists every entry — the ledger's default.
    /// Always paired with `kind = .expense`: the budget pools are
    /// expense-only, so the drill's rows reconcile with the tapped figure.
    var budgetExcluded: Bool? { didSet { guard !suppressReload, oldValue != budgetExcluded else { return }; scheduleReload() } }
    /// Entry scope of the ledger-wide list: true (default) lists every
    /// activity entry — member kept-in, guest posts, and entries the
    /// creator opted out of the ledger's books (e.g. repayments); false
    /// hides those opted-out entries. Irrelevant while a project filter is
    /// active — a project always shows all its entries.
    var includeExcluded = true { didSet { guard !suppressReload, oldValue != includeExcluded else { return }; scheduleReload() } }
    /// Project the page is hard-scoped to (the Journal follows the ledger
    /// switcher's scope). Not a user filter: the filter sheet can't change
    /// it, `clearFilters` restores it instead of lifting it. nil =
    /// ledger-wide page.
    var scopeProjectId: String?
    /// The last (ledger, scope) pair `syncScopeProjection` applied — the
    /// pop-back re-run guard's memory. A pushed page's return re-runs the
    /// host page's `.task`, which re-invokes the projection with unchanged
    /// inputs; the signature check is what keeps that re-run from wiping a
    /// manual project filter (see the method's doc).
    private var scopeSyncSignature: String?
    /// Row ordering, driven by the dashboard's month header (every other
    /// surface stays on `.date`). Not part of `clearFilters`: it's
    /// presentation intent, not a filter.
    var sort: EntrySort = .date { didSet { guard !suppressReload, oldValue != sort else { return }; scheduleReload() } }

    /// Coalesces filter bursts (a preset writes two bounds, Clear four+) into
    /// a single delayed reload so the list doesn't thrash mid-transition.
    private var reloadTask: Task<Void, Never>?
    private var suppressReload = false

    private func scheduleReload() {
        guard !suppressReload else { return }
        reloadTask?.cancel()
        reloadTask = Task {
            try? await Task.sleep(for: ReloadDebounce.interval)
            guard !Task.isCancelled else { return }
            // Runs the fetch as THIS task's body — the slot keeps pointing
            // at it so a later change still cancels the in-flight request.
            await performReload()
        }
    }

    var hasMore: Bool { entries.count < total }

    func load(ledgerId: String) async {
        guard self.ledgerId != ledgerId else { return }
        self.ledgerId = ledgerId
        entries = []
        total = 0
        loadError = nil
        // The All tab's fields show the extent — drop the old ledger's
        // until the new one's first reload refreshes it.
        entryBounds = nil
        dayTotals = [:]
        // New ledger is a genuine first load again.
        hasLoadedOnce = false
        await reloadFromStart()
    }

    /// Immediate refresh of exactly the rows the list has already loaded —
    /// offset 0 through the loaded count, in pages of at most
    /// `requestPageSizeCap` — so pull-to-refresh, cross-posting refreshes,
    /// and post-edit syncs keep the lazy-loaded pages and the scroll
    /// position instead of collapsing the list back to page 1. The server
    /// re-judges membership and order for the whole window. Fails silent:
    /// a warm refresh that errors keeps the loaded content (the list's
    /// data is still good) — the next pull-to-refresh retries.
    func reload() async {
        guard !entries.isEmpty else {
            // Nothing loaded yet: this is a cold retry, and it should
            // announce itself like a first load.
            await reloadFromStart()
            return
        }
        reloadTask?.cancel()
        reloadTask = nil
        guard let ledgerId else { return }
        // Captured up front, the same rule performReload follows: the
        // persist must describe the query these requests were built from,
        // not whatever the filters say by the time the last page lands.
        let snapshotKey = currentSnapshotKey
        let plan = Self.windowReloadPlan(
            loadedCount: entries.count,
            pageSize: Self.pageSize,
            pageCap: Self.requestPageSizeCap
        )
        var fetched: [JournalEntry] = []
        var latestTotal = total
        for (offset, limit) in plan {
            do {
                let response: EntriesResponse = try await fetchEntries(
                    ledgerId: ledgerId,
                    limit: limit,
                    offset: offset,
                    from: fromDate,
                    to: toDate,
                    sort: sort
                )
                guard self.ledgerId == ledgerId else { return }
                fetched += response.entries
                latestTotal = response.total
                // A short page means the filtered set shrank mid-refresh
                // (a concurrent delete); the tail is simply gone.
                if response.entries.count < limit { break }
            } catch {
                return
            }
        }
        guard self.ledgerId == ledgerId else { return }
        if entries != fetched { entries = fetched }
        if total != latestTotal { total = latestTotal }
        if loadError != nil { loadError = nil }
        refreshSidecars()
        persistSnapshot(snapshotKey: snapshotKey)
    }

    /// Immediate page-1 reset for content-changing paths: a fresh post
    /// (the new entry should be visible at the top), a ledger switch, or
    /// a retry after a failed first load. Supersedes any pending debounced
    /// task — it would refetch the same query right behind this one — then
    /// fetches inline.
    func reloadFromStart() async {
        reloadTask?.cancel()
        reloadTask = nil
        await performReload()
    }

    /// The one list request every read path goes through: the current
    /// filters plus the caller's window (limit/offset), date bounds, and
    /// order. `from`/`to` are explicit rather than implied — most callers
    /// pass the store's date filter, while the day-slice and extent
    /// callers pass their own bounds (or nil). `includingSearch: false`
    /// drops the text query for reads that describe the ledger's extent
    /// rather than the transient search (refreshBounds).
    private func fetchEntries(
        ledgerId: String,
        limit: Int,
        offset: Int,
        from: Date?,
        to: Date?,
        sort: EntrySort,
        dateAscending: Bool = false,
        includingSearch: Bool = true,
        filters: Filters? = nil
    ) async throws -> EntriesResponse {
        // The day-slice and extent callers override the window (or drop the
        // transient search) — everything else is the store's live filter,
        // unless the caller captured its filter state up front (the
        // sidecar tasks build their request beside their cache key).
        var resolvedFilters = filters ?? currentFilters
        resolvedFilters.from = from
        resolvedFilters.to = to
        if !includingSearch { resolvedFilters.q = "" }
        let query = Self.listQuery(
            filters: resolvedFilters,
            limit: limit,
            offset: offset,
            includeExcluded: includeExcluded,
            sort: sort,
            dateAscending: dateAscending
        )
        return try await client.request(
            "GET",
            "bookkeeping/ledgers/\(ledgerId)/entries" + query
        )
    }

    // MARK: snapshot cache

    /// The store's snapshot-cache binding — namespace and schema version
    /// live here, not at every call site. Bump `schema` when
    /// `JournalSnapshot`'s shape changes incompatibly.
    private static let cache = SnapshotCache.namespace("journal", schema: 1)

    /// The cold-load render seed: page 1 of the filtered list plus the
    /// sidecars the rows render beside. Pagination is deliberately absent —
    /// a remounted page starts at the top anyway, and `loadMore` refills
    /// the tail on scroll. Rows persist from confirmed list fetches
    /// (`persistSnapshot`); the sidecars merge at their own completion
    /// under the key their request was built from, so each field in the
    /// record always describes the query its fetch carried.
    private struct JournalSnapshot: Codable {
        var entries: [JournalEntry] = []
        var total = 0
        var dayTotals: [String: DayIncomeExpense] = [:]
        var entryBounds: EntryDateBounds? = nil
    }

    /// The snapshot's identity: the ledger plus the full query signature
    /// the list request would carry — filter pairs in their wire encoding
    /// (so a key can never disagree with the request it mirrors), the
    /// ordering, and the ledger-wide escape hatch. A drill-down's hard
    /// scope rides inside the project filter pair (the mount folds
    /// `scopeProjectId` into it), so no separate segment. Pure and
    /// nonisolated for tests.
    nonisolated static func snapshotKey(
        ledgerId: String,
        queryPairs: [(String, String?)],
        sort: EntrySort,
        includeExcluded: Bool
    ) -> String {
        let tokens = sortQueryTokens(sort)
        let sortSegment = tokens.order.map { "\(tokens.name ?? "date")-\($0)" } ?? tokens.name ?? "date"
        return SnapshotCache.makeKey([
            ledgerId,
            ApiQuery.build(queryPairs),
            sortSegment,
            includeExcluded ? "includeExcluded=true" : "includeExcluded=false",
        ])
    }

    private var currentSnapshotKey: String {
        Self.snapshotKey(
            ledgerId: ledgerId ?? "",
            queryPairs: currentFilters.queryPairs,
            sort: sort,
            includeExcluded: includeExcluded
        )
    }

    /// Publishes the cached snapshot as the cold surface's first render —
    /// rows, total, day headers, and extent all at once, then
    /// `hasLoadedOnce = true` so the fetch that follows stays silent
    /// (warm-refresh semantics) instead of announcing a first load over
    /// content already on screen. Only ever called before the first
    /// successful fetch (`performReload`'s cold branch): afterwards,
    /// fresher published data must never be rolled back. A hit does not
    /// republish the widget snapshot — that is a real-fetch duty
    /// (`WidgetSnapshotSync`), a hydrated render is not one.
    private func hydrateFromSnapshot(snapshotKey: String) {
        guard
            let snapshot: JournalSnapshot = Self.cache.read(
                key: snapshotKey, as: JournalSnapshot.self
            )
        else { return }
        if entries != snapshot.entries { entries = snapshot.entries }
        if total != snapshot.total { total = snapshot.total }
        if dayTotals != snapshot.dayTotals { dayTotals = snapshot.dayTotals }
        if entryBounds != snapshot.entryBounds { entryBounds = snapshot.entryBounds }
        hasLoadedOnce = true
    }

    /// Merges one payload piece into the cached record for `snapshotKey`.
    /// Read-modify-write with no await in between: every writer runs on the
    /// MainActor, so concurrent merges can't drop each other's fields.
    private func mergeIntoCache(
        snapshotKey: String,
        update: (inout JournalSnapshot) -> Void
    ) {
        var snapshot = Self.cache.read(key: snapshotKey, as: JournalSnapshot.self) ?? JournalSnapshot()
        update(&snapshot)
        Self.cache.write(key: snapshotKey, payload: snapshot)
    }

    /// Records the freshly fetched page 1 + total under this fetch's query
    /// signature. Called only from confirmed successful fetches — the
    /// optimistic delete's local mutation never lands here, so a failed
    /// sync can't poison the cache (the next reload rewrites it).
    private func persistSnapshot(snapshotKey: String) {
        mergeIntoCache(snapshotKey: snapshotKey) {
            $0.entries = Array(entries.prefix(Self.pageSize))
            $0.total = total
        }
    }

    /// The fetch itself. Never cancels the calling task: when it runs as
    /// the debounced task's body, cancelling the slot's task would cancel
    /// the request mid-flight (which surfaced as a network error on every
    /// filter change until the user tapped retry).
    private func performReload() async {
        guard let ledgerId else { return }
        // The snapshot key is captured before the fetch: the hydrate read
        // and the success persist must both describe the query this fetch
        // was built from, even while the visible filters move mid-flight
        // (the debounced reload refetches under the new signature anyway).
        let snapshotKey = currentSnapshotKey
        // A cold surface renders its cached snapshot first: the page paints
        // last-known rows instead of flashing the empty state, and the
        // fetch below silently corrects them. A cache miss falls through
        // to the spinner-then-rows first load.
        if !hasLoadedOnce {
            hydrateFromSnapshot(snapshotKey: snapshotKey)
        }
        // Warm refreshes (pull-to-refresh, post/edit/delete reloads) stay
        // silent: the refresh control already signals the activity. Every
        // @Observable write notifies even when the value is unchanged, and
        // those pointless render passes re-diff the List mid-refresh, which
        // re-lays-out the bottom search bar and flashes it once. So only the
        // first load announces itself, and only real changes are written.
        let announcesLoad = !hasLoadedOnce
        if announcesLoad { isLoading = true }
        defer {
            if isLoading { isLoading = false }
        }
        do {
            let response: EntriesResponse = try await fetchEntries(
                ledgerId: ledgerId,
                limit: Self.pageSize,
                offset: 0,
                from: fromDate,
                to: toDate,
                sort: sort
            )
            guard self.ledgerId == ledgerId else { return }
            if entries != response.entries { entries = response.entries }
            if total != response.total { total = response.total }
            if loadError != nil { loadError = nil }
            if !hasLoadedOnce { hasLoadedOnce = true }
            refreshSidecars()
            persistSnapshot(snapshotKey: snapshotKey)
        } catch {
            guard self.ledgerId == ledgerId else { return }
            // A cancelled fetch is a superseded one — a newer reload owns
            // the content now — so don't clear the list or flash an error.
            if error is CancellationError { return }
            // APIClient wraps URLSession errors in APIError.transport, so a
            // fetch cancelled by a superseding reload surfaces wrapped.
            if let apiError = error as? APIError, case .transport(let urlError) = apiError,
               urlError.code == .cancelled { return }
            // A surface with content — fetched or hydrated — keeps it on a
            // failed refresh, the same keep-previous rule the sidecars and
            // the stats component follow: the rows on screen are still the
            // best known state, and the next reload (filter change, retry,
            // appearance) retries silently. Only an empty surface — nothing
            // fetched, nothing cached — announces the failure.
            guard entries.isEmpty else { return }
            if total != 0 { total = 0 }
            if loadError != error.localizedDescription {
                loadError = error.localizedDescription
            }
        }
    }

    func loadMore() async {
        guard hasMore, !isLoading, !isLoadingMore else { return }
        guard let ledgerId else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let response: EntriesResponse = try await fetchEntries(
                ledgerId: ledgerId,
                limit: Self.pageSize,
                offset: entries.count,
                from: fromDate,
                to: toDate,
                sort: sort
            )
            entries += response.entries
            total = response.total
        } catch {
            // Keep the entries loaded so far; the next appearance retries.
        }
    }

    /// Fetches every page under the current filters without touching the
    /// visible list — the settlement share card renders a member's full
    /// detail, and the day-slice edit refresh refetches exactly one day,
    /// neither limited to the pages the list happens to have loaded. Pass
    /// `from`/`to` to scope the sweep (one day each for the slice
    /// refresh); nil bounds sweep the whole filtered set. Returns nil on
    /// any fetch failure. The hard page cap is far above the share card's
    /// render cap (200 rows) so a desynchronized `total` cannot spin this
    /// forever; once we've satisfied `total` we stop early.
    func fetchAllEntries(from: Date? = nil, to: Date? = nil) async -> [JournalEntry]? {
        guard let ledgerId else { return nil }
        var all: [JournalEntry] = []
        var pages = 0
        let maxPages = 100
        while pages < maxPages {
            pages += 1
            do {
                let response: EntriesResponse = try await fetchEntries(
                    ledgerId: ledgerId,
                    limit: Self.requestPageSizeCap,
                    offset: all.count,
                    from: from,
                    to: to,
                    sort: .date
                )
                all += response.entries
                // Total exhaustion always wins: empty pages after we've
                // matched `total` are the expected tail, not a failure.
                if all.count >= response.total { return all }
                // An empty page before we've matched `total` is a real
                // signal of a desynchronized server.
                if response.entries.isEmpty { return nil }
            } catch {
                return nil
            }
        }
        return nil
    }

    func post(_ draft: QuickEntryDraft) async throws {
        // Throw, never silently return: save() shows success the moment this
        // doesn't throw, so a nil-ledger no-op would fake a successful post.
        guard let ledgerId else { throw APIError.noActiveLedger }
        _ = try await client.send(
            "POST",
            "bookkeeping/ledgers/\(ledgerId)/entries",
            body: draft.body
        )
        // Reset to page 1: the fresh entry should be visible at the top.
        await reloadFromStart()
    }

    /// Optimistic delete: the entry leaves the local list the moment this
    /// runs — the row animates away with no network wait, `total` drops
    /// with it — and the server sync continues in the background task this
    /// returns. A failed sync puts the entry back at its original index
    /// (only while the same ledger is still loaded) and hands the error to
    /// `onSyncFailure` for the caller's toast. Deleting the bottom-most
    /// loaded row backfills the next page once the server has confirmed —
    /// that row's `onAppear` already fired, so nothing else would trigger
    /// `loadMore`. Throws only when no ledger is loaded.
    func delete(
        _ entry: JournalEntry,
        onSyncFailure: @escaping @MainActor (String) -> Void
    ) throws -> Task<Void, Never> {
        guard let ledgerId else { throw APIError.noActiveLedger }
        let index = entries.firstIndex { $0.id == entry.id }
        let wasLastLoaded = index == entries.count - 1
        if let index {
            entries.remove(at: index)
            if total > 0 { total -= 1 }
        }
        return Task {
            do {
                _ = try await client.send(
                    "DELETE",
                    "bookkeeping/ledgers/\(ledgerId)/entries/\(entry.id)"
                )
                // A concurrent refetch (pull-to-refresh, filter change) can
                // resurrect the row while the delete is in flight — drop it
                // again now that the server has confirmed.
                if let index = entries.firstIndex(where: { $0.id == entry.id }) {
                    entries.remove(at: index)
                    if total > 0 { total -= 1 }
                }
                // Backfill only after the server processed the delete: the
                // offset must line up with the post-delete ordering, or the
                // page would repeat a row the list still holds.
                if wasLastLoaded, hasMore {
                    await loadMore()
                }
                // The deleted row's amounts left its day's total.
                refreshDayTotals()
            } catch {
                // Only a same-ledger list may take the row back; a ledger
                // switch owns different content now.
                guard self.ledgerId == ledgerId else { return }
                if let index, index <= entries.count,
                   !entries.contains(where: { $0.id == entry.id }) {
                    entries.insert(entry, at: index)
                    total += 1
                }
                onSyncFailure(error.localizedDescription)
            }
        }
    }

    /// Replaces an entry's date, memo, lines, and participants from the
    /// same draft shape a fresh post uses; the server keeps entryNo and
    /// the original creator.
    ///
    /// The refresh is day-scoped: only the entry's old and — when the date
    /// changed — new day are refetched (one small request each, two at
    /// most), and the returned rows replace that day's contiguous slice in
    /// the list. Every other loaded day is untouched, so the scroll
    /// position survives however deep the list is. The server re-judges
    /// the day's membership under the active filters (e.g. a settlement
    /// edit that removes the member drops the row), so no client-side
    /// predicate mirrors the query.
    func update(_ entry: JournalEntry, draft: QuickEntryDraft) async throws {
        guard let ledgerId else { throw APIError.noActiveLedger }
        let updated: JournalEntry = try await client.request(
            "PUT",
            "bookkeeping/ledgers/\(ledgerId)/entries/\(entry.id)",
            body: draft.body
        )
        await refreshEditedEntry(entry, updated: updated)
    }

    /// Day-scoped refresh after a successful edit. All-or-nothing: every
    /// involved day must refetch before any slice is written, so a failure
    /// leaves the list exactly as-is (the edit itself already landed
    /// server-side; the next pull-to-refresh retries). Silent, like every
    /// warm refresh.
    private func refreshEditedEntry(_ old: JournalEntry, updated: JournalEntry) async {
        guard let ledgerId else { return }
        guard sort == .date else {
            // Amount order is global — a day's rows are not contiguous in
            // it, so no day slice can be spliced in. Fall back to the
            // whole-window refresh.
            await reload()
            return
        }
        let days = Self.editRefreshTargets(
            oldDay: Calendar.current.startOfDay(for: old.date),
            newDay: Calendar.current.startOfDay(for: updated.date),
            oldestLoadedDay: entries.last.map { Calendar.current.startOfDay(for: $0.date) },
            fromDate: fromDate,
            toDate: toDate
        )
        var fetchedDays: [(day: Date, rows: [JournalEntry])] = []
        for day in days {
            guard let rows = await fetchAllEntries(from: day, to: day) else { return }
            fetchedDays.append((day, rows))
        }
        // A ledger switch during the fetches makes the fetched rows foreign
        // to whatever the store holds now — drop them entirely.
        guard self.ledgerId == ledgerId else { return }
        var result = entries
        for (day, rows) in fetchedDays {
            result = Self.replacingDay(result, day: day, with: rows)
        }
        if result != entries { entries = result }
        // An edit can move the entry out of the active filters (a
        // settlement participant removal): its day slice then comes back
        // without it, and the list's filtered total drops by one — the
        // same bookkeeping delete() does inline.
        if entries.contains(where: { $0.id == updated.id }),
           !result.contains(where: { $0.id == updated.id }),
           total > 0 {
            total -= 1
        }
        if loadError != nil { loadError = nil }
        refreshSidecars()
    }

    /// Forces the project filter onto the ledger switcher's scope — but
    /// only when the (ledger, scope) pair actually moved. The journal page
    /// calls this from its `.task(id:)` (ledger switch, and the pop-back
    /// re-run every push return produces) and from its live scope onChange;
    /// an unconditional write would reset a manual project filter the user
    /// picked in the funnel sheet on the ledger-wide page every time a
    /// pushed chart page was popped back. The ledger id is explicit
    /// because the caller must name the ledger it renders — which during
    /// a switch precedes `load` seeding the store's own `ledgerId`. A
    /// ledger switch changes the signature even when neither ledger is
    /// scoped, so the previous ledger's manual pick can never survive into
    /// the new ledger's list (its project id is meaningless there — the
    /// sheet would render a blank row over a filtered list).
    func syncScopeProjection(ledgerId: String?, scopeProjectId: String?) {
        let signature = "\(ledgerId ?? "-")|\(scopeProjectId ?? "-")"
        guard signature != scopeSyncSignature else { return }
        scopeSyncSignature = signature
        if self.scopeProjectId != scopeProjectId { self.scopeProjectId = scopeProjectId }
        if projectFilterId != scopeProjectId { projectFilterId = scopeProjectId }
    }

    /// Batched clear: suppresses the per-key didSet storms so exactly one
    /// coalesced reload runs for all filters. Already-empty filters are
    /// left untouched — a redundant write still notifies observers and
    /// re-renders (flashes) the search field mid-animation.
    func clearFilters() {
        suppressReload = true
        if !searchQuery.isEmpty { searchQuery = "" }
        if fromDate != nil { fromDate = nil }
        if toDate != nil { toDate = nil }
        if participantUserId != nil { participantUserId = nil }
        // A scoped page keeps its scope; an unscoped one drops the pick.
        if projectFilterId != scopeProjectId { projectFilterId = scopeProjectId }
        if accountId != nil { accountId = nil }
        if parentAccountId != nil { parentAccountId = nil }
        if accountType != nil { accountType = nil }
        if memberUserId != nil { memberUserId = nil }
        if kind != nil { kind = nil }
        if budgetExcluded != nil { budgetExcluded = nil }
        if !includeExcluded { includeExcluded = true }
        suppressReload = false
        scheduleReload()
    }

    /// Batched window write: suppresses the per-key didSet storms so both
    /// bounds commit with at most one scheduled reload — or none, when the
    /// caller (the dashboard task) fetches immediately after instead.
    /// Takes a `MonthWindow` — the dashboard's month-summary range, the
    /// journal's month tab, and the drill-down sheet's fixed window all
    /// share that struct so the call site stays one value, not two.
    func setWindow(_ window: MonthWindow) {
        suppressReload = true
        fromDate = window.from
        toDate = window.to
        suppressReload = false
    }

    /// Refreshes the per-day income/expense totals the date-section headers
    /// render: one small request mirroring the list's filters, so a header
    /// total always describes the rows beneath it — the WHOLE day, not just
    /// the pages that have loaded (pagination can't split a total). Runs
    /// beside every reload like `refreshBounds`; the list never awaits it,
    /// and a failure keeps the previous totals for the next reload to retry.
    func refreshDayTotals() {
        guard let ledgerId else { return }
        // Built at the capture point, beside the key: the request AND the
        // key it merges under must describe the same filters, even if the
        // visible filters move before the task body runs.
        let snapshotKey = currentSnapshotKey
        let summaryPath = "bookkeeping/ledgers/\(ledgerId)/reports/daily-summary"
            + Self.dailySummaryQuery(filters: currentFilters)
        dayTotalsTask?.cancel()
        dayTotalsTask = Task {
            do {
                let response: DailySummaryResponse = try await client.request(
                    "GET",
                    summaryPath
                )
                guard self.ledgerId == ledgerId, !Task.isCancelled else { return }
                let map = Dictionary(
                    uniqueKeysWithValues: response.days.map { ($0.day, $0) }
                )
                if dayTotals != map { dayTotals = map }
                mergeIntoCache(snapshotKey: snapshotKey) { $0.dayTotals = map }
            } catch {
                // Keep the previous totals; the next reload retries.
            }
        }
    }

    /// The sidecar refreshes every reload carries — the entry extent (the
    /// All tab's from/to) and the day headers' per-day totals. One entry
    /// point so a reload path can't refresh one and forget the other.
    func refreshSidecars() {
        refreshBounds()
        refreshDayTotals()
    }

    /// Refreshes the entry date extent: one entry fetched oldest-first and
    /// one newest-first, mirroring the list's filters minus the date window
    /// and the text query (the extent is about what the ledger contains,
    /// not the transient search). Runs beside every reload and after
    /// postings elsewhere; the list rendering never awaits it.
    func refreshBounds() {
        guard let ledgerId else { return }
        // Built at the capture point, beside the key — same rule as
        // refreshDayTotals.
        let snapshotKey = currentSnapshotKey
        let snapshotFilters = currentFilters
        boundsTask?.cancel()
        boundsTask = Task {
            do {
                // Sequential awaits, not `async let`: the response decode
                // runs under the store's MainActor isolation. The extent
                // ignores the transient text search and the date window —
                // it describes what the ledger contains, not what is
                // currently being searched.
                let oldest: EntriesResponse = try await fetchEntries(
                    ledgerId: ledgerId,
                    limit: 1,
                    offset: 0,
                    from: nil,
                    to: nil,
                    sort: .date,
                    dateAscending: true,
                    includingSearch: false,
                    filters: snapshotFilters
                )
                let newest: EntriesResponse = try await fetchEntries(
                    ledgerId: ledgerId,
                    limit: 1,
                    offset: 0,
                    from: nil,
                    to: nil,
                    sort: .date,
                    includingSearch: false,
                    filters: snapshotFilters
                )
                guard self.ledgerId == ledgerId, !Task.isCancelled else { return }
                if let earliest = oldest.entries.first?.date,
                   let latest = newest.entries.first?.date {
                    let bounds = EntryDateBounds(earliest: earliest, latest: latest)
                    if entryBounds != bounds { entryBounds = bounds }
                    mergeIntoCache(snapshotKey: snapshotKey) { $0.entryBounds = bounds }
                }
            } catch {
                // Keep the previous extent; the next reload retries.
            }
        }
    }

    /// Page plan for a loaded-window refresh: whole pages of `pageCap`
    /// rows then one partial tail. The floor of `pageSize` keeps a cold
    /// list's refresh at one ordinary page-size request.
    nonisolated static func windowReloadPlan(
        loadedCount: Int,
        pageSize: Int,
        pageCap: Int
    ) -> [(offset: Int, limit: Int)] {
        let loaded = max(pageSize, loadedCount)
        return stride(from: 0, to: loaded, by: pageCap).map { offset in
            (offset: offset, limit: min(pageCap, loaded - offset))
        }
    }

    /// Which days an edit's day-slice refresh must refetch: always the old
    /// day; the new day too only when it moved, stays within the loaded
    /// span (a day older than everything loaded is below the window — the
    /// moved-away row simply leaves the list), and passes the date-range
    /// filter. Pure so the skip rules stay unit-testable.
    nonisolated static func editRefreshTargets(
        oldDay: Date,
        newDay: Date,
        oldestLoadedDay: Date?,
        fromDate: Date?,
        toDate: Date?
    ) -> [Date] {
        var days = [oldDay]
        guard newDay != oldDay else { return days }
        if let oldestLoadedDay, newDay < oldestLoadedDay { return days }
        if let fromDate, newDay < Calendar.current.startOfDay(for: fromDate) { return days }
        if let toDate, newDay > Calendar.current.startOfDay(for: toDate) { return days }
        days.append(newDay)
        return days
    }

    /// Replaces every row of `day` (startOfDay semantics, the same key
    /// `groupedByDay` groups by) in the date-sorted list with `fetched` —
    /// the day's rows are contiguous, so this is one slice write. A day
    /// with no existing rows inserts `fetched` at its date position
    /// (newest-first day order); empty `fetched` for an existing day
    /// removes it. Pure so the day-refresh arithmetic stays unit-testable.
    nonisolated static func replacingDay(
        _ entries: [JournalEntry],
        day: Date,
        with fetched: [JournalEntry]
    ) -> [JournalEntry] {
        let dayKey = Calendar.current.startOfDay(for: day)
        var result = entries
        guard let start = result.firstIndex(where: {
            Calendar.current.startOfDay(for: $0.date) == dayKey
        }) else {
            guard !fetched.isEmpty else { return result }
            let insertAt = result.firstIndex(where: {
                Calendar.current.startOfDay(for: $0.date) < dayKey
            }) ?? result.count
            result.insert(contentsOf: fetched, at: insertAt)
            return result
        }
        var end = start
        while end < result.count, Calendar.current.startOfDay(for: result[end].date) == dayKey {
            end += 1
        }
        result.replaceSubrange(start..<end, with: fetched)
        return result
    }

    /// The list's local startOfDay rendered as the server's "yyyy-MM-dd"
    /// day key — pinned to the Gregorian calendar (a device set to a non-
    /// Gregorian calendar must still produce ISO-style keys) in the current
    /// timezone, no locale: it must match the daily-summary endpoint's
    /// tz-shifted bucketing, not the device's date format. Pure so the key
    /// arithmetic stays unit-testable.
    nonisolated static func dayKey(_ day: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        let components = calendar.dateComponents([.year, .month, .day], from: day)
        return String(
            format: "%04d-%02d-%02d",
            components.year ?? 0,
            components.month ?? 0,
            components.day ?? 0
        )
    }

    /// The filter surface the list request and the daily-summary request
    /// share — one struct so the two query builders can't drift. List
    /// mechanics (pagination, ordering, includeExcluded) and the summary's
    /// tz offset stay with their own builders.
    private struct Filters {
        var q = ""
        var from: Date?
        var to: Date?
        var participantUserId: String?
        var projectId: String?
        var accountId: String?
        /// Top-level rollup drill-down: entries against this parent OR any
        /// of its children.
        var parentAccountId: String?
        var accountType: String?
        var memberUserId: String?
        var kind: QuickEntryKind?
        /// The budget-flag drill axis — both requests carry it so a day
        /// header totals exactly the rows beneath it.
        var budgetExcluded: Bool?

        /// The aggregation's numerator the daily summary must pass
        /// explicitly (the endpoint has no default). The ruling: a ledger's
        /// stats speak `members` — each entry split across its participants,
        /// only ledger members' slices counted, the stat card's figure —
        /// while a project's books speak `line` (raw line sums, every
        /// participant counts). Derived from the project filter so every
        /// mount picks its scope's mode without a per-call-site decision.
        var shareMode: ReportShareMode { projectId == nil ? .members : .line }

        /// The wire pairs both requests send — the trim and the local
        /// end-of-day conversion included, so the two endpoints encode
        /// identical values for identical store state.
        var queryPairs: [(String, String?)] {
            [
                ("q", q.isEmpty ? nil : q.trimmingCharacters(in: .whitespacesAndNewlines)),
                ("from", from.map { ApiQuery.iso($0) }),
                ("to", to.map { ApiQuery.iso(AppDates.localEndOfDay($0)) }),
                ("participantUserId", participantUserId),
                ("projectId", projectId),
                ("accountId", accountId),
                ("parentAccountId", parentAccountId),
                ("accountType", accountType),
                ("memberUserId", memberUserId),
                ("kind", kind?.rawValue),
                ("excludedFromBudget", budgetExcluded.map { $0 ? "true" : "false" }),
            ]
        }
    }

    /// The store's current filter state, as both request builders read it.
    private var currentFilters: Filters {
        Filters(
            q: searchQuery,
            from: fromDate,
            to: toDate,
            participantUserId: participantUserId,
            projectId: projectFilterId,
            accountId: accountId,
            parentAccountId: parentAccountId,
            accountType: accountType,
            memberUserId: memberUserId,
            kind: kind,
            budgetExcluded: budgetExcluded
        )
    }

    /// The daily-summary request's query: the shared filter pairs plus the
    /// scope-derived `shareMode` (no server default — every caller declares
    /// its numerator) and the tz offset that keys each entry to the LOCAL
    /// day it was entered on (the budget report's contract). No list
    /// mechanics and — for the ordinary surfaces — no `includeExcluded`:
    /// the endpoint is a stat, and the route's defaults keep stats on the
    /// ledger's activity set. An opted-out entry stays listed (marked
    /// 不计入收支) but its amounts stay out of every day total, matching
    /// the month stat card.
    ///
    /// The rows are the header's audit trail: a day header totals exactly
    /// what the rows beneath it can account for — per row the 分摊 caption
    /// (`memberSharesCents`, the same server figure the header splits by)
    /// or the headline where the two are equal, minus the rows the
    /// 不计收支 flag marks.
    ///
    /// EXCEPTION — the budget-flag drill: its rows DO include creator
    /// opt-outs (the budget pool counts them, and the list rides the
    /// store's includeExcluded=true), so the day headers must too — or a
    /// header would silently drop the very entries the tapped figure
    /// counts. The flag rides only while the axis is set, leaving every
    /// other surface's header contract untouched.
    private static func dailySummaryQuery(filters: Filters) -> String {
        ApiQuery.build(
            filters.queryPairs + [
                ("shareMode", filters.shareMode.rawValue),
                ("tzOffsetMinutes", String(AppDates.localTzOffsetMinutes)),
                ("includeExcluded", filters.budgetExcluded != nil ? "true" : nil),
            ]
        )
    }

    /// The wire tokens an `EntrySort` maps to — the single encoding both
    /// the list request (`sort`/`order` params) and the snapshot key's
    /// ordering segment derive from, so the two can't drift. Pure and
    /// nonisolated; pattern matching because the enum's `Equatable` is
    /// MainActor-isolated.
    nonisolated static func sortQueryTokens(_ sort: EntrySort) -> (name: String?, order: String?) {
        switch sort {
        case .date: return (nil, nil)
        case .amountDescending: return ("amount", "desc")
        case .amountAscending: return ("amount", "asc")
        }
    }

    /// The list request's query: the shared filter pairs plus the list's
    /// own mechanics — pagination, the ledger-wide escape hatch, and
    /// ordering (`dateAscending` feeds only the extent's oldest-first read).
    private static func listQuery(
        filters: Filters,
        limit: Int,
        offset: Int,
        includeExcluded: Bool,
        sort: EntrySort,
        dateAscending: Bool
    ) -> String {
        let tokens = sortQueryTokens(sort)
        return ApiQuery.build(
            filters.queryPairs + [
                ("limit", String(limit)),
                ("offset", String(offset)),
                ("includeExcluded", includeExcluded ? "true" : nil),
                ("sort", tokens.name),
                ("order", tokens.order ?? (dateAscending ? "asc" : nil)),
            ]
        )
    }
}
