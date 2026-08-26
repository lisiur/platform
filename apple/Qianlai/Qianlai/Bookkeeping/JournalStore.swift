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

    var searchQuery = "" { didSet { if oldValue != searchQuery { Task { await reload() } } } }
    var fromDate: Date? { didSet { Task { await reload() } } }
    var toDate: Date? { didSet { Task { await reload() } } }
    var participantMemberId: String? { didSet { Task { await reload() } } }

    var hasMore: Bool { entries.count < total }

    func load(ledgerId: String) async {
        guard self.ledgerId != ledgerId else { return }
        self.ledgerId = ledgerId
        entries = []
        total = 0
        loadError = nil
        await reload()
    }

    func reload() async {
        guard let ledgerId else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let response: EntriesResponse = try await client.request(
                "GET",
                "bookkeeping/ledgers/\(ledgerId)/entries" + Self.query(
                    limit: Self.pageSize,
                    offset: 0,
                    q: searchQuery,
                    from: fromDate,
                    to: toDate,
                    participant: participantMemberId
                )
            )
            guard self.ledgerId == ledgerId else { return }
            entries = response.entries
            total = response.total
            loadError = nil
        } catch {
            guard self.ledgerId == ledgerId else { return }
            entries = []
            total = 0
            loadError = error.localizedDescription
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
                    participant: participantMemberId
                )
            )
            entries += response.entries
            total = response.total
        } catch {
            // Keep the entries loaded so far; the next appearance retries.
        }
    }

    func post(_ draft: QuickEntryDraft) async throws {
        guard let ledgerId else { return }
        _ = try await client.send(
            "POST",
            "bookkeeping/ledgers/\(ledgerId)/entries",
            body: draft.body
        )
        await reload()
    }

    func delete(_ entry: JournalEntry) async throws {
        guard let ledgerId else { return }
        _ = try await client.send(
            "DELETE",
            "bookkeeping/ledgers/\(ledgerId)/entries/\(entry.id)"
        )
        await reload()
    }

    func clearFilters() {
        searchQuery = ""
        fromDate = nil
        toDate = nil
        participantMemberId = nil
    }

    var hasActiveFilters: Bool {
        !searchQuery.isEmpty || fromDate != nil || toDate != nil || participantMemberId != nil
    }

    private static func query(
        limit: Int,
        offset: Int,
        q: String,
        from: Date?,
        to: Date?,
        participant: String?
    ) -> String {
        ApiQuery.build([
            ("limit", String(limit)),
            ("offset", String(offset)),
            ("q", q.isEmpty ? nil : q.trimmingCharacters(in: .whitespacesAndNewlines)),
            ("from", from.map { ApiQuery.iso(UTCDates.startOfUTCDay($0)) }),
            ("to", to.map { ApiQuery.iso(UTCDates.endOfUTCDay($0)) }),
            ("participantMemberId", participant),
        ])
    }
}
