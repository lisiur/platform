//
//  LocalDatabase.swift
//  Qianlai
//

import Foundation
import GRDB

/// The local ledger database (T1.3): one SQLite file per install, opened
/// through a single GRDB `DatabaseQueue`. WAL + a busy timeout keep the
/// app's reads/writes snappy and future-proof a second reader process
/// (the ledger file lives in the App Group container on iOS for exactly
/// that headroom); nothing else is tuned — plain durability over exotic
/// pragmas.
///
/// Threading shape: the queue is Sendable, repositories hop onto its
/// async read/write lanes, so no repository ever blocks the main actor
/// and every mutation is transactional by construction (`write` gives
/// one). Tests open in-memory queues through the same door.
nonisolated final class LocalDatabase {
    /// One queue per process — repositories share it.
    nonisolated(unsafe) static let shared: LocalDatabase? = {
        try? LocalDatabase(fileURL: defaultFileURL())
    }()

    let writer: DatabaseQueue

    /// Opens (creating if needed) and migrates the database at `fileURL`.
    /// `inMemory: true` builds an unnamed in-memory queue for tests.
    init(fileURL: URL? = nil, inMemory: Bool = false) throws {
        if inMemory {
            writer = try DatabaseQueue()
        } else {
            let url = fileURL ?? Self.defaultFileURL()
            guard let url else {
                // No App Group container (missing entitlement) and no App
                // Support fallback: local storage can't exist. Callers gate
                // on `shared == nil` and route cloud-only.
                throw LocalStoreError.storageUnavailable
            }
            let directory = url.deletingLastPathComponent()
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            var configuration = Configuration()
            configuration.prepareDatabase { db in
                try db.execute(sql: "PRAGMA busy_timeout = 5000")
                try db.execute(sql: "PRAGMA journal_mode = WAL")
                try db.execute(sql: "PRAGMA foreign_keys = ON")
            }
            writer = try DatabaseQueue(path: url.path, configuration: configuration)
        }
        try Self.migrateViaWriter(writer)
    }

    /// The file's home: the App Group container on iOS/xrOS (cross-process
    /// headroom), Application Support on macOS (no App Group entitlement
    /// there today). Nil when no writable home exists.
    static func defaultFileURL() -> URL? {
        #if os(iOS) || os(xrOS)
        guard
            let container = FileManager.default.containerURL(
                forSecurityApplicationGroupIdentifier: WidgetAppGroup.suiteName
            )
        else { return nil }
        return container.appendingPathComponent("local-ledger.sqlite3")
        #else
        guard
            let support = FileManager.default.urls(
                for: .applicationSupportDirectory, in: .userDomainMask
            ).first
        else { return nil }
        let directory = support.appendingPathComponent("Qianlai", isDirectory: true)
        return directory.appendingPathComponent("local-ledger.sqlite3")
        #endif
    }

    /// Migration is part of opening — every door (init) applies the linear
    /// migrator before the queue is usable. `migrate` takes the WRITER
    /// (it manages its own transactions on the queue).
    private static func migrateViaWriter(_ queue: DatabaseQueue) throws {
        var migrator = DatabaseMigrator()
        LocalSchema.register(migrator: &migrator)
        try migrator.migrate(queue)
    }

    /// Read snapshot for tests / diagnostics.
    var appliedMigrationCount: Int {
        (try? writer.read { db in
            try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM grdb_migrations") ?? 0
        }) ?? 0
    }
}

nonisolated enum LocalStoreError: LocalizedError {
    case storageUnavailable
    case ledgerNotFound

    var errorDescription: String? {
        switch self {
        case .storageUnavailable:
            L10n.string("local.error.storageUnavailable", defaultValue: "Local storage isn't available on this device.")
        case .ledgerNotFound:
            L10n.string("local.error.ledgerNotFound", defaultValue: "Ledger not found.")
        }
    }
}
