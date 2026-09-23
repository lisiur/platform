//
//  SnapshotCache.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/20.
//

import Foundation

/// Last-known-good payload persistence for the stores: each successful
/// fetch publishes a snapshot here, and a cold surface (fresh store
/// instance, fresh app launch) hydrates from it before its fetch so the
/// page paints last-known content instead of flashing the empty state.
/// The fetch still runs and silently corrects the hydrated values — the
/// cache is a render seed, never a data source of record.
///
/// UserDefaults-backed in the `WidgetDataStore` / `RecentCategoryStore`
/// style: a stateless enum with injectable defaults so tests use their
/// own suite. App-private (standard defaults, not the App Group) — the
/// widget has its own snapshot channel. Payloads are encoded in a versioned
/// envelope: a schema bump (or a decode failure from model drift) reads as
/// a cache miss, so stale shapes degrade to today's cold load instead of
/// crashing the read.
nonisolated enum SnapshotCache {
    /// Storage-key prefix — `clearAll` sweeps exactly these keys and
    /// touches nothing else living in the same defaults suite.
    private static let keyPrefix = "snapshot."

    private static let lruIndexSuffix = ".lru"

    /// The versioned wrapper every cached payload rides in. `schema` is
    /// per-namespace (bump it when the payload's shape changes
    /// incompatibly); a mismatch reads as a miss.
    private struct Envelope<P: Codable>: Codable {
        var schema: Int
        var payload: P
    }

    /// One store's binding to the cache: the namespace and schema version
    /// are fixed here so read/write sites carry only the payload key —
    /// the triple doesn't travel to every call site.
    struct Namespace {
        private let name: String
        private let schema: Int

        fileprivate init(name: String, schema: Int) {
            self.name = name
            self.schema = schema
        }

        func read<P: Codable>(
            key: String,
            as type: P.Type,
            defaults: UserDefaults = .standard
        ) -> P? {
            SnapshotCache.read(name, key: key, schema: schema, as: type, defaults: defaults)
        }

        func write<P: Codable>(
            key: String,
            payload: P,
            cap: Int = 16,
            defaults: UserDefaults = .standard
        ) {
            SnapshotCache.write(
                name, key: key, schema: schema, payload: payload, cap: cap, defaults: defaults
            )
        }
    }

    /// Binds a namespace + schema version for one store's cache calls.
    static func namespace(_ name: String, schema: Int) -> Namespace {
        Namespace(name: name, schema: schema)
    }

    /// Joins a cache key's segments — caller-owned parts (ids, encoded
    /// query strings, epoch seconds) in a fixed order. Pipe-separated:
    /// every producer feeds segments that already avoid the character
    /// (ids are server-generated, queries are percent-encoded).
    static func makeKey(_ parts: [String]) -> String {
        parts.joined(separator: "|")
    }

    /// The shared encoding for an optional window bound in a cache key:
    /// epoch seconds, or "all" when absent. ReportStore's windowed keys
    /// and StatsStore's window keys both speak it, so the convention can't
    /// drift apart between them.
    static func epochOrAll(_ date: Date?) -> String {
        date.map { String($0.timeIntervalSince1970) } ?? "all"
    }

    /// The shared token tail for a ledger-windowed payload's cache key —
    /// the ledger id, then the window's optional bounds in `epochOrAll`
    /// encoding. The stats/range stores' keys and ReportStore's windowed
    /// report keys (which prefix a report name) all build on it, so the
    /// segment order can't drift apart between them.
    static func ledgerWindowTokens(
        ledgerId: String, from: Date?, to: Date?
    ) -> [String] {
        [ledgerId, epochOrAll(from), epochOrAll(to)]
    }

    /// Reads the payload stored under `namespace`/`key`, or nil when
    /// nothing (or an incompatible envelope — other schema, corrupted
    /// data) is there. Any failure is a miss by design.
    static func read<P: Codable>(
        _ namespace: String,
        key: String,
        schema: Int,
        as type: P.Type,
        defaults: UserDefaults = .standard
    ) -> P? {
        guard
            let data = defaults.data(forKey: storageKey(namespace: namespace, key: key)),
            let envelope = try? JSONDecoder().decode(Envelope<P>.self, from: data),
            envelope.schema == schema
        else { return nil }
        return envelope.payload
    }

    /// Stores the payload and moves `key` to the front of the namespace's
    /// LRU index, evicting the tail beyond `cap`. Writes are the recency
    /// signal — reads never touch the index (they happen on cold mounts,
    /// where promoting a key would pin rarely-visited filter states). All
    /// writes are expected on one actor (the stores' MainActor merges):
    /// `prune`'s index read-modify-write has no lock of its own.
    static func write<P: Codable>(
        _ namespace: String,
        key: String,
        schema: Int,
        payload: P,
        cap: Int = 16,
        defaults: UserDefaults = .standard
    ) {
        guard let data = try? JSONEncoder().encode(
            Envelope(schema: schema, payload: payload)
        ) else { return }
        let storage = storageKey(namespace: namespace, key: key)
        defaults.set(data, forKey: storage)
        prune(namespace: namespace, keeping: key, cap: cap, defaults: defaults)
    }

    /// Drops every snapshot key in the suite — sign-out cleanup.
    static func clearAll(defaults: UserDefaults = .standard) {
        for key in defaults.dictionaryRepresentation().keys where key.hasPrefix(keyPrefix) {
            defaults.removeObject(forKey: key)
        }
    }

    private static func storageKey(namespace: String, key: String) -> String {
        keyPrefix + namespace + "." + key
    }

    /// Rewrites the namespace's LRU index with `key` promoted to the front
    /// and removes the storage keys evicted past `cap`. The index itself
    /// rides under the same `snapshot.` prefix so `clearAll` sweeps it.
    private static func prune(
        namespace: String,
        keeping key: String,
        cap: Int,
        defaults: UserDefaults
    ) {
        let indexKey = keyPrefix + namespace + lruIndexSuffix
        var index = (defaults.stringArray(forKey: indexKey) ?? []).filter { $0 != key }
        index.insert(key, at: 0)
        for evictedKey in index.dropFirst(cap) {
            defaults.removeObject(forKey: storageKey(namespace: namespace, key: evictedKey))
        }
        // Unconditional write-back: the index only accumulates across
        // writes if every write persists it — skipping the "unchanged"
        // case would leave the read side forever empty and nothing would
        // ever be evicted.
        defaults.set(Array(index.prefix(cap)), forKey: indexKey)
    }
}
