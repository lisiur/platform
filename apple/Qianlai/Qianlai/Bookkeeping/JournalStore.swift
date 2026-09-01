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
    /// them, tagged with them, or untagged (split across all members).
    var memberUserId: String? { didSet { scheduleReload() } }
    /// Ledger-wide escape hatch: also list entries flagged out of the
    /// ledger's books (guest posts, opted-out repayments). Irrelevant while
    /// a project filter is active — a project always shows all its entries.
    var includeExcluded = false { didSet { scheduleReload() } }
    /// Project the page is hard-scoped to (the Journal follows the ledger
    /// switcher's scope). Not a user filter: the filter sheet can't change
    /// it, `clearFilters` restores it instead of lifting it, and
    /// `hasActiveFilters` ignores it. nil = ledger-wide page.
    var scopeProjectId: String?

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
                    includeExcluded: includeExcluded
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
                    includeExcluded: includeExcluded
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

    func delete(_ entry: JournalEntry) async throws {
        guard let ledgerId else { throw APIError.noActiveLedger }
        _ = try await client.send(
            "DELETE",
            "bookkeeping/ledgers/\(ledgerId)/entries/\(entry.id)"
        )
        await reload()
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
        if includeExcluded { includeExcluded = false }
        suppressReload = false
        scheduleReload()
    }

    var hasActiveFilters: Bool {
        !searchQuery.isEmpty || fromDate != nil || toDate != nil || participantMemberId != nil || projectFilterId != scopeProjectId || accountId != nil || accountType != nil || memberUserId != nil || includeExcluded
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
        includeExcluded: Bool
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
        ])
    }
}
