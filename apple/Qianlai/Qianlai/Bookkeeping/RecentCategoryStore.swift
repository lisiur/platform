//
//  RecentCategoryStore.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/5.
//

import Foundation

/// Locally persisted recently-used category ids, scoped per ledger and
/// entry kind (expense and income draw from disjoint category sets, so
/// their recency lists never mix). Backed by UserDefaults — no server
/// round-trip; a category that is archived or deleted simply stops
/// resolving on read, the stored list itself is never cleaned up.
enum RecentCategoryStore {
    private static let keyPrefix = "qianlai.recentCategories"

    /// Recents stay small: the entry form's recents row only has room
    /// for a handful of capsules.
    static let cap = 6

    /// Most-recent-first ids previously recorded for this ledger + kind,
    /// never more than `cap` (older caches trim on read too).
    static func ids(
        ledgerId: String,
        kind: QuickEntryKind,
        defaults: UserDefaults = .standard
    ) -> [String] {
        guard let data = defaults.data(forKey: key(ledgerId: ledgerId, kind: kind)) else {
            return []
        }
        let stored = (try? JSONDecoder().decode([String].self, from: data)) ?? []
        return Array(stored.prefix(cap))
    }

    /// Moves the category to the front (dropping a previous occurrence)
    /// and truncates the list to `cap`.
    static func record(
        _ accountId: String,
        ledgerId: String,
        kind: QuickEntryKind,
        cap: Int = RecentCategoryStore.cap,
        defaults: UserDefaults = .standard
    ) {
        var updated = ids(ledgerId: ledgerId, kind: kind, defaults: defaults)
            .filter { $0 != accountId }
        updated.insert(accountId, at: 0)
        guard let data = try? JSONEncoder().encode(Array(updated.prefix(cap))) else {
            return
        }
        defaults.set(data, forKey: key(ledgerId: ledgerId, kind: kind))
    }

    private static func key(ledgerId: String, kind: QuickEntryKind) -> String {
        "\(keyPrefix).\(ledgerId).\(kind.rawValue)"
    }
}
