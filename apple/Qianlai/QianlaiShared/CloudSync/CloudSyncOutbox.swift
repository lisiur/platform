//
//  CloudSyncOutbox.swift
//  Qianlai
//

import Foundation

/// One pending send: the zone + record the engine must enqueue.
nonisolated struct CloudSyncPendingChange: Equatable, Hashable, Sendable {
    var zoneName: String
    var recordType: String
    var recordName: String
}

/// The write path → sync engine bridge (T2.3): repositories append the
/// rows they changed; the engine drains the queue into CKSyncEngine's
/// pending changes (which the engine itself persists with its state —
/// the discipline R1 pins). Thread-safe: write repositories run on GRDB's
/// writer lanes, the engine drains on the main actor.
///
/// Durability contract: the outbox is in-memory. If the app dies between
/// a committed write and the engine's enqueue, the queue misses that
/// change — the engine's startup full-enqueue covers the gap (it re-adds
/// every ledger zone's rows; sends are idempotent overwrites keyed by the
/// stable recordName). No persisted outbox, no second state store (R1
/// forbids inventing state).
nonisolated final class CloudSyncOutbox: Sendable {
    nonisolated(unsafe) static let shared = CloudSyncOutbox()

    /// Zone names.
    nonisolated static func ledgerZone(_ ledgerId: String) -> String {
        "qianlai-ledger-\(ledgerId)"
    }

    nonisolated static let profileZone = "qianlai-local-profile"

    private let lock = NSLock()
    private var pending: [CloudSyncPendingChange] = []
    private var deletions: [CloudSyncPendingChange] = []
    private var deletedZones: [String] = []

    /// Records the zone's deletion (ledger delete) — the engine processes
    /// deletions ahead of sends.
    func enqueueZoneDeletion(_ zoneName: String) {
        lock.lock()
        defer { lock.unlock() }
        deletedZones.append(zoneName)
        pending.removeAll { $0.zoneName == zoneName }
        deletions.removeAll { $0.zoneName == zoneName }
    }

    /// Records one changed row.
    func enqueue(zoneName: String, recordType: String, recordName: String) {
        lock.lock()
        defer { lock.unlock() }
        pending.append(
            CloudSyncPendingChange(zoneName: zoneName, recordType: recordType, recordName: recordName)
        )
    }

    /// Records one deleted row (the cloud copy must go with it).
    func enqueueDeletion(zoneName: String, recordType: String, recordName: String) {
        lock.lock()
        defer { lock.unlock() }
        deletions.append(
            CloudSyncPendingChange(zoneName: zoneName, recordType: recordType, recordName: recordName)
        )
    }

    /// Drains everything (the engine's tick). Returns the zone deletions,
    /// record deletions, then the sends — each deduplicated in order.
    func drain() -> (
        zoneDeletions: [String],
        recordDeletions: [CloudSyncPendingChange],
        changes: [CloudSyncPendingChange]
    ) {
        lock.lock()
        defer { lock.unlock() }
        let zones = deletedZones
        deletedZones = []
        var recordDeletions: [CloudSyncPendingChange] = []
        var seenDeletions = Set<CloudSyncPendingChange>()
        for deletion in deletions where seenDeletions.insert(deletion).inserted {
            recordDeletions.append(deletion)
        }
        deletions = []
        var changes: [CloudSyncPendingChange] = []
        var seen = Set<CloudSyncPendingChange>()
        for change in pending where seen.insert(change).inserted {
            changes.append(change)
        }
        pending = []
        return (zones, recordDeletions, changes)
    }

    /// A test/inspection peek without draining.
    func pendingCount() -> Int {
        lock.lock()
        defer { lock.unlock() }
        return pending.count
    }
}
