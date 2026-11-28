//
//  LocalAttachmentStore.swift
//  Qianlai
//

import Foundation
import CryptoKit
import GRDB

/// One photo receipt's storage row (`qianlai_entry_attachment`, v2).
nonisolated struct LocalAttachmentRow: Codable, Equatable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "qianlai_entry_attachment"
    static var databaseColumnDecodingStrategy = DatabaseColumnDecodingStrategy.convertFromSnakeCase
    static var databaseColumnEncodingStrategy = DatabaseColumnEncodingStrategy.convertToSnakeCase

    var id: String
    /// NULL while staged (uploaded before the claiming entry exists).
    var entryId: String?
    var mimeType: String
    var size: Int
    var hash: String
    var filePath: String
    var createdAt: String
    var pendingSync: Bool
}

/// Local photo-receipt storage (T2.4's write half): bytes in the
/// attachments directory (Application Support — app-process-private, the
/// same home the dev plan pins), rows in the database so the sync engine
/// and the transfer document have one record per receipt. Reads come back
/// as the same `EntryAttachmentRef` the cloud entries carry; loading the
/// bytes is a file read away (the display cache's local branch, T2.4's
/// read half).
nonisolated final class LocalAttachmentStore {
    let database: LocalDatabase

    init(database: LocalDatabase) {
        self.database = database
    }

    /// The attachments directory (created on demand). The App Group
    /// container on iOS/xrOS; Application Support when the entitlement is
    /// missing (tests, mis-provisioned builds).
    static func directory() throws -> URL {
        #if os(iOS) || os(xrOS)
        if let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: WidgetAppGroup.suiteName
        ) {
            let directory = container
                .appendingPathComponent("Qianlai", isDirectory: true)
                .appendingPathComponent("attachments", isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            return directory
        }
        #endif
        guard
            let support = FileManager.default.urls(
                for: .applicationSupportDirectory, in: .userDomainMask
            ).first
        else {
            throw LocalStoreError.storageUnavailable
        }
        let directory = support
            .appendingPathComponent("Qianlai", isDirectory: true)
            .appendingPathComponent("attachments", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    /// Stages one receipt (entry not yet known — the claim flow). Returns
    /// the ref the quick-entry draft carries as a claimed id.
    @discardableResult
    func stage(
        data: Data,
        mimeType: String,
        now: Date = Date()
    ) async throws -> EntryAttachmentRef {
        let id = UUID().uuidString
        let directory = try Self.directory()
        let fileName = "\(id).\(Self.fileExtension(for: mimeType))"
        try data.write(to: directory.appendingPathComponent(fileName), options: .atomic)
        let row = LocalAttachmentRow(
            id: id,
            entryId: nil,
            mimeType: mimeType,
            size: data.count,
            hash: Self.sha256Hex(data),
            filePath: fileName,
            createdAt: LocalValues.timestamp(from: now),
            pendingSync: true
        )
        try await database.writer.write { db in
            try row.insert(db)
        }
        return EntryAttachmentRef(id: id, mimeType: mimeType, size: data.count, createdAt: now)
    }

    /// Claims staged receipt ids onto their entry (idempotent — already
    /// claimed ids just re-point at the same row they own).
    func claim(ids: [String], entryId: String) async throws {
        guard !ids.isEmpty else { return }
        try await database.writer.write { db in
            for id in ids {
                try db.execute(
                    sql: "UPDATE qianlai_entry_attachment SET entry_id = ? WHERE id = ?",
                    arguments: [entryId, id]
                )
            }
        }
    }

    /// Saves one receipt claimed directly (rare — the staged flow is the
    /// normal path).
    @discardableResult
    func save(
        entryId: String,
        data: Data,
        mimeType: String,
        now: Date = Date()
    ) async throws -> EntryAttachmentRef {
        let ref = try await stage(data: data, mimeType: mimeType, now: now)
        try await claim(ids: [ref.id], entryId: entryId)
        return ref
    }

    /// The receipt rows for one entry (upload order preserved).
    func attachments(entryId: String) async throws -> [EntryAttachmentRef] {
        let rows = try await database.writer.read { db in
            try LocalAttachmentRow
                .filter(Column("entry_id") == entryId)
                .order(Column("created_at"))
                .order(Column("id"))
                .fetchAll(db)
        }
        return rows.map(\.ref)
    }

    /// Drops the receipt rows not in `keepIds` (the update path's final
    /// set semantics) and deletes the orphaned files with them.
    func prune(entryId: String, keeping keepIds: [String]) async throws {
        let rows = try await database.writer.read { db in
            try LocalAttachmentRow
                .filter(Column("entry_id") == entryId)
                .fetchAll(db)
        }
        let keep = Set(keepIds)
        let removed = rows.filter { !keep.contains($0.id) }
        guard !removed.isEmpty else { return }
        let directory = try Self.directory()
        try await database.writer.write { db in
            for row in removed {
                _ = try LocalAttachmentRow.deleteOne(db, key: row.id)
            }
        }
        for row in removed {
            try? FileManager.default.removeItem(at: directory.appendingPathComponent(row.filePath))
        }
    }

    /// Deletes every receipt of one entry (the entry delete path) — rows
    /// cascade via FK; the files go by hand.
    func deleteAll(entryId: String) async throws {
        let rows = try await database.writer.read { db in
            try LocalAttachmentRow
                .filter(Column("entry_id") == entryId)
                .fetchAll(db)
        }
        guard !rows.isEmpty else { return }
        let directory = try Self.directory()
        try await database.writer.write { db in
            try db.execute(
                sql: "DELETE FROM qianlai_entry_attachment WHERE entry_id = ?",
                arguments: [entryId]
            )
        }
        for row in rows {
            try? FileManager.default.removeItem(at: directory.appendingPathComponent(row.filePath))
        }
    }

    /// Reads one receipt's bytes (the display path's local branch).
    func data(for ref: EntryAttachmentRef) -> Data? {
        data(forId: ref.id)
    }

    /// Bytes by id alone (the cache's lookup key is the attachment id).
    func data(forId attachmentId: String) -> Data? {
        guard
            let directory = try? Self.directory()
        else { return nil }
        // Row lookup resolves the file name (the ref alone carries no
        // path); fall back to the id-based name the writer uses.
        if let row = try? database.writer.read({ db in
            try LocalAttachmentRow.fetchOne(db, key: attachmentId)
        }), let data = try? Data(contentsOf: directory.appendingPathComponent(row.filePath)) {
            return data
        }
        return try? Data(contentsOf: directory.appendingPathComponent("\(attachmentId).jpg"))
    }

    // MARK: - Helpers

    static func fileExtension(for mimeType: String) -> String {
        switch mimeType {
        case "image/png": return "png"
        case "image/heic", "image/heif": return "heic"
        case "image/webp": return "webp"
        case "image/gif": return "gif"
        default: return "jpg"
        }
    }

    /// Digest-sized sha256 hex (the transfer format's integrity field).
    static func sha256Hex(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}

extension LocalAttachmentRow {
    /// The API shape the entry payloads carry.
    var ref: EntryAttachmentRef {
        EntryAttachmentRef(
            id: id,
            mimeType: mimeType,
            size: size,
            createdAt: LocalValues.date(fromTimestamp: createdAt) ?? .distantPast
        )
    }
}
