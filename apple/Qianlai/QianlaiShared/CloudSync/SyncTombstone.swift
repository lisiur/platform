//
//  SyncTombstone.swift
//  Qianlai
//

import Foundation
import GRDB

/// One deleted ledger's tombstone (`qianlai_sync_tombstone`, v3). The
/// row is permanent: ledger ids are UUIDs, so a tombstoned id can never
/// legitimately come back — only the delete/fetch race could resurrect
/// it, and that is exactly what the tombstone exists to block.
nonisolated struct LocalSyncTombstoneRow: Codable, Equatable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "qianlai_sync_tombstone"
    static var databaseColumnDecodingStrategy = DatabaseColumnDecodingStrategy.convertFromSnakeCase
    static var databaseColumnEncodingStrategy = DatabaseColumnEncodingStrategy.convertToSnakeCase

    var id: String
    var deletedAt: String
}

/// The tombstone read/write helpers the delete path and the sync engine's
/// fetched-apply share.
nonisolated enum SyncTombstone {
    static func record(ledgerId: String, now: Date = Date()) -> LocalSyncTombstoneRow {
        LocalSyncTombstoneRow(id: ledgerId, deletedAt: LocalValues.timestamp(from: now))
    }

    /// The tombstoned ledger ids — loaded once per fetched-changes batch.
    static func allIds(_ db: Database) throws -> Set<String> {
        Set(try String.fetchAll(db, sql: "SELECT id FROM qianlai_sync_tombstone"))
    }

    static func contains(_ db: Database, ledgerId: String) -> Bool {
        (try? Bool.fetchOne(
            db, sql: "SELECT 1 FROM qianlai_sync_tombstone WHERE id = ? LIMIT 1",
            arguments: [ledgerId]
        )) ?? false
    }
}
