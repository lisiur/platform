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
    /// True once the first reload finished. Background refetches afterwards
    /// must keep the current content (rows or empty state) on screen instead
    /// of swapping in a blocking spinner — that swap was flashing the empty
    /// state and bouncing the layout under the search bar.
    private(set) var hasLoadedOnce = false

    var searchQuery = "" { didSet { guard !suppressReload, oldValue != searchQuery else { return }; scheduleReload() } }
    var fromDate: Date? { didSet { scheduleReload() } }
    var toDate: Date? { didSet { scheduleReload() } }
    var participantMemberId: String? { didSet { scheduleReload() } }
    var projectFilterId: String? { didSet { scheduleReload() } }
    /// Ledger-wide escape hatch: also list entries flagged out of the
    /// ledger's books (guest posts, opted-out repayments). Irrelevant while
    /// a project filter is active — a project always shows all its entries.
    var includeExcluded = false { didSet { scheduleReload() } }

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
            await reload()
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

    func reload() async {
        guard let ledgerId else { return }
        // An immediate reload supersedes any pending debounced one — e.g.
        // the filter didSet that fired just before a ledger switch's load —
        // or it would refetch the same query right behind this one.
        reloadTask?.cancel()
        reloadTask = nil
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
            if !hasLoadedOnce { hasLoadedOnce = true }
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
                    includeExcluded: includeExcluded
                )
            )
            guard self.ledgerId == ledgerId else { return }
            if entries != response.entries { entries = response.entries }
            if total != response.total { total = response.total }
            if loadError != nil { loadError = nil }
        } catch {
            guard self.ledgerId == ledgerId else { return }
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
    /// coalesced reload runs for all four filters. Already-empty filters are
    /// left untouched — a redundant write still notifies observers and
    /// re-renders (flashes) the search field mid-animation.
    func clearFilters() {
        suppressReload = true
        if !searchQuery.isEmpty { searchQuery = "" }
        if fromDate != nil { fromDate = nil }
        if toDate != nil { toDate = nil }
        if participantMemberId != nil { participantMemberId = nil }
        if projectFilterId != nil { projectFilterId = nil }
        if includeExcluded { includeExcluded = false }
        suppressReload = false
        scheduleReload()
    }

    var hasActiveFilters: Bool {
        !searchQuery.isEmpty || fromDate != nil || toDate != nil || participantMemberId != nil || projectFilterId != nil || includeExcluded
    }

    private static func query(
        limit: Int,
        offset: Int,
        q: String,
        from: Date?,
        to: Date?,
        participant: String?,
        project: String?,
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
            ("includeExcluded", includeExcluded ? "true" : nil),
        ])
    }
}
