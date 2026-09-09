//
//  JournalStore.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import Foundation
import Observation

/// Journal entries for the active ledger: paginated list with search, date
/// range, and participant filters, plus quick-entry posting and deletion.
@MainActor
@Observable
final class JournalStore {
    static let pageSize = 20

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

    var searchQuery = "" { didSet { guard !suppressReload, oldValue != searchQuery else { return }; scheduleReload() } }
    var fromDate: Date? { didSet { scheduleReload() } }
    var toDate: Date? { didSet { scheduleReload() } }
    var participantMemberId: String? { didSet { scheduleReload() } }
    var projectFilterId: String? { didSet { scheduleReload() } }
    /// Category drill-down: only entries with a line against this account.
    var accountId: String? { didSet { scheduleReload() } }
    /// Statement flow drill-down: only entries with a line against an
    /// account of this type (expense vs income totals).
    var accountType: String? { didSet { scheduleReload() } }
    /// Settlement drill-down: entries that involve this user — created by
    /// or paid for by them, tagged with them, or untagged (split across all
    /// members).
    var memberUserId: String? { didSet { scheduleReload() } }
    /// Entry scope of the ledger-wide list: true (default) lists every
    /// activity entry — member kept-in, guest posts, and entries the
    /// creator opted out of the ledger's books (e.g. repayments); false
    /// hides those opted-out entries. Irrelevant while a project filter is
    /// active — a project always shows all its entries.
    var includeExcluded = true { didSet { scheduleReload() } }
    /// Project the page is hard-scoped to (the Journal follows the ledger
    /// switcher's scope). Not a user filter: the filter sheet can't change
    /// it, `clearFilters` restores it instead of lifting it, and
    /// `hasActiveFilters` ignores it. nil = ledger-wide page.
    var scopeProjectId: String?
    /// Row ordering, driven by the dashboard's month header (every other
    /// surface stays on `.date`). Not part of `hasActiveFilters`/`clearFilters`:
    /// it's presentation intent, not a filter-sheet filter.
    var sort: EntrySort = .date { didSet { guard !suppressReload, oldValue != sort else { return }; scheduleReload() } }

    /// Coalesces filter bursts (a preset writes two bounds, Clear four+) into
    /// a single delayed reload so the list doesn't thrash mid-transition.
    private var reloadTask: Task<Void, Never>?
    private var suppressReload = false

    private func scheduleReload() {
        guard !suppressReload else { return }
        reloadTask?.cancel()
        reloadTask = Task {
            try? await Task.sleep(for: .milliseconds(200))
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
        // New ledger is a genuine first load again.
        hasLoadedOnce = false
        await reload()
    }

    /// Immediate reload (pull-to-refresh, retry, post/edit/delete, ledger
    /// switch): supersedes any pending debounced task — it would refetch
    /// the same query right behind this one — then fetches inline.
    func reload() async {
        reloadTask?.cancel()
        reloadTask = nil
        await performReload()
    }

    /// The fetch itself. Never cancels the calling task: when it runs as
    /// the debounced task's body, cancelling the slot's task would cancel
    /// the request mid-flight (which surfaced as a network error on every
    /// filter change until the user tapped retry).
    private func performReload() async {
        guard let ledgerId else { return }
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
            let response: EntriesResponse = try await client.request(
                "GET",
                "bookkeeping/ledgers/\(ledgerId)/entries" + Self.query(
                    limit: Self.pageSize,
                    offset: 0,
                    q: searchQuery,
                    from: fromDate,
                    to: toDate,
                    participant: participantMemberId,
                    project: projectFilterId,
                    account: accountId,
                    accountType: accountType,
                    member: memberUserId,
                    includeExcluded: includeExcluded,
                    sort: sort
                )
            )
            guard self.ledgerId == ledgerId else { return }
            if entries != response.entries { entries = response.entries }
            if total != response.total { total = response.total }
            if loadError != nil { loadError = nil }
            if !hasLoadedOnce { hasLoadedOnce = true }
        } catch {
            guard self.ledgerId == ledgerId else { return }
            // A cancelled fetch is a superseded one — a newer reload owns
            // the content now — so don't clear the list or flash an error.
            if error is CancellationError { return }
            // APIClient wraps URLSession errors in APIError.transport, so a
            // fetch cancelled by a superseding reload surfaces wrapped.
            if let apiError = error as? APIError, case .transport(let urlError) = apiError,
               urlError.code == .cancelled { return }
            if !entries.isEmpty { entries = [] }
            if total != 0 { total = 0 }
            if loadError != error.localizedDescription {
                loadError = error.localizedDescription
            }
        }
    }

    func loadMore() async {
        guard hasMore, !isLoading, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let response: EntriesResponse = try await client.request(
                "GET",
                "bookkeeping/ledgers/\(ledgerId!)/entries" + Self.query(
                    limit: Self.pageSize,
                    offset: entries.count,
                    q: searchQuery,
                    from: fromDate,
                    to: toDate,
                    participant: participantMemberId,
                    project: projectFilterId,
                    account: accountId,
                    accountType: accountType,
                    member: memberUserId,
                    includeExcluded: includeExcluded,
                    sort: sort
                )
            )
            entries += response.entries
            total = response.total
        } catch {
            // Keep the entries loaded so far; the next appearance retries.
        }
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
        await reload()
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
    func update(_ entry: JournalEntry, draft: QuickEntryDraft) async throws {
        guard let ledgerId else { throw APIError.noActiveLedger }
        _ = try await client.send(
            "PUT",
            "bookkeeping/ledgers/\(ledgerId)/entries/\(entry.id)",
            body: draft.body
        )
        await reload()
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
        if participantMemberId != nil { participantMemberId = nil }
        // A scoped page keeps its scope; an unscoped one drops the pick.
        if projectFilterId != scopeProjectId { projectFilterId = scopeProjectId }
        if accountId != nil { accountId = nil }
        if accountType != nil { accountType = nil }
        if memberUserId != nil { memberUserId = nil }
        if !includeExcluded { includeExcluded = true }
        suppressReload = false
        scheduleReload()
    }

    /// Batched window write: suppresses the per-key didSet storms so both
    /// bounds commit with at most one scheduled reload — or none, when the
    /// caller (the dashboard task) fetches immediately after instead.
    func setWindow(from: Date?, to: Date?) {
        suppressReload = true
        fromDate = from
        toDate = to
        suppressReload = false
    }

    var hasActiveFilters: Bool {
        !searchQuery.isEmpty || fromDate != nil || toDate != nil || participantMemberId != nil || projectFilterId != scopeProjectId || accountId != nil || accountType != nil || memberUserId != nil || !includeExcluded
    }

    private static func query(
        limit: Int,
        offset: Int,
        q: String,
        from: Date?,
        to: Date?,
        participant: String?,
        project: String?,
        account: String?,
        accountType: String?,
        member: String?,
        includeExcluded: Bool,
        sort: EntrySort
    ) -> String {
        ApiQuery.build([
            ("limit", String(limit)),
            ("offset", String(offset)),
            ("q", q.isEmpty ? nil : q.trimmingCharacters(in: .whitespacesAndNewlines)),
            ("from", from.map { ApiQuery.iso($0) }),
            ("to", to.map { ApiQuery.iso(AppDates.localEndOfDay($0)) }),
            ("participantMemberId", participant),
            ("projectId", project),
            ("accountId", account),
            ("accountType", accountType),
            ("memberUserId", member),
            ("includeExcluded", includeExcluded ? "true" : nil),
            ("sort", sort == .date ? nil : "amount"),
            ("order", sort == .amountAscending ? "asc" : sort == .amountDescending ? "desc" : nil),
        ])
    }
}
