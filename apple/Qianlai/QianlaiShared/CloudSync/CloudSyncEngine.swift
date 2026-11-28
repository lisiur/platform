//
//  CloudSyncEngine.swift
//  Qianlai
//

import CloudKit
import Foundation
import GRDB

/// The one `CKSyncEngine` per process (T2.3): every local ledger's rows
/// sync through it to the user's iCloud PRIVATE database.
///
/// Zone strategy (the dev plan §3): one custom zone per ledger
/// (`qianlai-ledger-<ledgerId>` — deleting a ledger deletes its zone, an
/// atomic state-clean removal) plus one per-install `qianlai-local-profile`
/// zone for the real accounts and the local-scoped preferences (deleting a
/// ledger never touches it).
///
/// State discipline (R1, the plan's hard rule): CKSyncEngine's own state
/// serialization IS the only sync state store — persisted to Application
/// Support through the engine's `stateUpdate` events (the official
/// interface, event-driven, atomic write). No invented state, no manual
/// serialization formats, no outbox file. The in-memory `CloudSyncOutbox`
/// bridges write-repository commits into `pendingRecordZoneChanges`
/// (which the engine persists); an app death between commit and enqueue
/// is healed by the startup full enqueue (sends are idempotent
/// overwrites keyed by the stable recordName).
///
/// accountChange (the plan's §3): sign-out → stop, keep every local row
/// (登出 iCloud → 停同步保留本地数据); sign-in → full re-enqueue (重登录
/// → 自动续传). Local reads/writes never consult the engine — they are
/// storage operations and run regardless (Q2③).
///
/// Record schema: `CloudSyncMapping`'s frozen v1 (C4). Photos ride
/// `attachment` records' CKAsset; entry records never carry bytes; a
/// quota failure on a photo leaves its `pendingSync` flag set (Q2② — the
/// 空间不足 surface reads the count), text data keeps flowing.
@MainActor
final class CloudSyncEngine: NSObject {
    static let shared = CloudSyncEngine()

    /// The container from the entitlements (the app's own identifier).
    private static let containerID = "iCloud.top.hapaul.qianlai"

    /// The engine state's persistence file (Application Support — the
    /// plan's pinned home; the attachments directory's sibling).
    private static var stateFileURL: URL? {
        guard
            let support = FileManager.default.urls(
                for: .applicationSupportDirectory, in: .userDomainMask
            ).first
        else { return nil }
        let directory = support.appendingPathComponent("Qianlai", isDirectory: true)
        return directory.appendingPathComponent("cloud-sync-state.data")
    }

    /// Send batch cap: CKSyncEngine splits per batch; a modest cap keeps
    /// operations under CloudKit's limits with photos in the mix.
    private static let batchSize = 200

    let status = CloudSyncStatus()
    private var syncEngine: CKSyncEngine?
    private var database: LocalDatabase?
    /// Zones this process has already pushed a `.saveZone` for — the
    /// ensure pass runs once per zone per launch (re-saves are idempotent,
    /// the set only saves the round trips).
    private var zonesEnsuredThisRun: Set<String> = []
    /// recordName → (zoneName, recordType) for the record provider — the
    /// enqueue side's type map. The outbox carries the type; pending
    /// changes (persisted engine state) only carry record IDs, so the
    /// provider rebuilds rows from this map. Entries added before a crash
    /// that never got sent fall back to the startup full enqueue.
    private let recordTypeByRecordName = LockedDictionary<String, (zoneName: String, recordType: String)>()

    /// Idempotent activation: opens the engine when the container is
    /// reachable; otherwise parks in `.icloudUnavailable` (Q2① — 未登录
    /// iCloud 可建可用，登录后自动开始同步). Call again on sign-in.
    func activate(database: LocalDatabase) {
        self.database = database
        guard syncEngine == nil else {
            tick()
            return
        }
        let container = CKContainer(identifier: Self.containerID)
        let saved: CKSyncEngine.State.Serialization? = Self.readStateSerialization()
        let configuration = CKSyncEngine.Configuration(
            database: container.privateCloudDatabase,
            stateSerialization: saved,
            delegate: self
        )
        syncEngine = CKSyncEngine(configuration)
        status.update(.idle)
        Task { await fullEnqueueIfFirstRun(savedExists: saved != nil) }
        tick()
    }

    /// Drains the write path's outbox into the engine's pending changes.
    /// Called after every local write (the repositories' hooks) and on
    /// activation. Zones referenced by the drained changes are ensured
    /// (a pending `.saveZone` once per zone per process — idempotent on
    /// the server).
    func tick() {
        guard let syncEngine else { return }
        let (zoneDeletions, recordDeletions, changes) = CloudSyncOutbox.shared.drain()
        if !zoneDeletions.isEmpty {
            syncEngine.state.add(pendingDatabaseChanges: zoneDeletions.map {
                .deleteZone(CKRecordZone.ID(zoneName: $0, ownerName: CKCurrentUserDefaultName))
            })
        }
        if !recordDeletions.isEmpty {
            var deletionPending: [CKSyncEngine.PendingRecordZoneChange] = []
            for deletion in recordDeletions {
                let zoneID = CKRecordZone.ID(zoneName: deletion.zoneName, ownerName: CKCurrentUserDefaultName)
                deletionPending.append(
                    .deleteRecord(CloudSyncMapping.recordID(deletion.recordName, zoneID: zoneID))
                )
                recordTypeByRecordName.set(deletion.recordName, (deletion.zoneName, deletion.recordType))
            }
            syncEngine.state.add(pendingRecordZoneChanges: deletionPending)
        }
        guard !changes.isEmpty else { return }
        var pending: [CKSyncEngine.PendingRecordZoneChange] = []
        var zoneSaves: [CKRecordZone] = []
        for change in changes {
            if !zonesEnsuredThisRun.contains(change.zoneName) {
                zonesEnsuredThisRun.insert(change.zoneName)
                zoneSaves.append(CKRecordZone(zoneName: change.zoneName))
            }
            let zoneID = CKRecordZone.ID(zoneName: change.zoneName, ownerName: CKCurrentUserDefaultName)
            let recordID = CloudSyncMapping.recordID(change.recordName, zoneID: zoneID)
            pending.append(.saveRecord(recordID))
            recordTypeByRecordName.set(change.recordName, (change.zoneName, change.recordType))
        }
        if !zoneSaves.isEmpty {
            syncEngine.state.add(pendingDatabaseChanges: zoneSaves.map { .saveZone($0) })
        }
        syncEngine.state.add(pendingRecordZoneChanges: pending)
    }

    /// Adds every row of one ledger's zone (the zone's whole content) —
    /// the create flow's bootstrap and the startup healing pass.
    func enqueueLedgerZone(ledgerId: String) async {
        guard let database else { return }
        let zoneName = CloudSyncOutbox.ledgerZone(ledgerId)
        let outbox = CloudSyncOutbox.shared
        do {
            try await database.writer.read { db in
                guard let ledger = try LocalLedgerRow.fetchOne(db, key: ledgerId) else { return }
                outbox.enqueue(zoneName: zoneName, recordType: CloudSyncMapping.RecordType.ledger, recordName: ledger.id)
                let members = try LocalLedgerMemberRow
                    .filter(Column("ledger_id") == ledgerId)
                    .fetchAll(db)
                for row in members {
                    outbox.enqueue(zoneName: zoneName, recordType: CloudSyncMapping.RecordType.ledgerMember, recordName: row.id)
                }
                let accounts = try LocalBookAccountRow
                    .filter(Column("ledger_id") == ledgerId)
                    .fetchAll(db)
                for row in accounts {
                    outbox.enqueue(zoneName: zoneName, recordType: CloudSyncMapping.RecordType.bookAccount, recordName: row.id)
                }
                let entries = try LocalJournalEntryRow
                    .filter(Column("ledger_id") == ledgerId)
                    .fetchAll(db)
                for row in entries {
                    outbox.enqueue(zoneName: zoneName, recordType: CloudSyncMapping.RecordType.journalEntry, recordName: row.id)
                }
                let entryIds = entries.map(\.id)
                if !entryIds.isEmpty {
                    let placeholders = entryIds.map { _ in "?" }.joined(separator: ",")
                    let lines = try LocalJournalLineRow.fetchAll(
                        db, sql: "SELECT * FROM qianlai_journal_line WHERE entry_id IN (\(placeholders))",
                        arguments: StatementArguments(entryIds)
                    )
                    for row in lines {
                        outbox.enqueue(zoneName: zoneName, recordType: CloudSyncMapping.RecordType.journalLine, recordName: row.id)
                    }
                    let participants = try LocalEntryParticipantRow.fetchAll(
                        db, sql: "SELECT * FROM qianlai_journal_entry_participant WHERE entry_id IN (\(placeholders))",
                        arguments: StatementArguments(entryIds)
                    )
                    for row in participants {
                        outbox.enqueue(zoneName: zoneName, recordType: CloudSyncMapping.RecordType.entryParticipant, recordName: row.id)
                    }
                }
                let projects = try LocalProjectRow
                    .filter(Column("ledger_id") == ledgerId)
                    .fetchAll(db)
                for row in projects {
                    outbox.enqueue(zoneName: zoneName, recordType: CloudSyncMapping.RecordType.project, recordName: row.id)
                    let members = try LocalProjectMemberRow
                        .filter(Column("project_id") == row.id)
                        .fetchAll(db)
                    for member in members {
                        outbox.enqueue(zoneName: zoneName, recordType: CloudSyncMapping.RecordType.projectMember, recordName: member.id)
                    }
                }
                let years = try LocalBudgetYearRow
                    .filter(Column("ledger_id") == ledgerId)
                    .fetchAll(db)
                for row in years {
                    outbox.enqueue(zoneName: zoneName, recordType: CloudSyncMapping.RecordType.budgetYear, recordName: row.id)
                    let overrides = try LocalBudgetMonthOverrideRow
                        .filter(Column("budget_year_id") == row.id)
                        .fetchAll(db)
                    for override in overrides {
                        outbox.enqueue(zoneName: zoneName, recordType: CloudSyncMapping.RecordType.budgetMonthOverride, recordName: override.id)
                    }
                }
                let categoryBudgets = try LocalCategoryBudgetRow
                    .filter(Column("ledger_id") == ledgerId)
                    .fetchAll(db)
                for row in categoryBudgets {
                    outbox.enqueue(zoneName: zoneName, recordType: CloudSyncMapping.RecordType.categoryBudgetYear, recordName: row.id)
                }
            }
        } catch {
            status.update(.error, message: error.localizedDescription)
        }
        tick()
    }

    /// The startup healing pass: on the engine's FIRST run (no persisted
    /// state) enqueue every zone's rows — sends are idempotent overwrites.
    /// On later runs the engine's persisted pending changes already carry
    /// the work; a clean resync rides the accountChange sign-in path.
    private func fullEnqueueIfFirstRun(savedExists: Bool) async {
        guard !savedExists, let database else { return }
        // Profile zone first (real accounts + local preferences).
        let outbox = CloudSyncOutbox.shared
        do {
            try await database.writer.read { db in
                let realAccounts = try LocalRealAccountRow.fetchAll(db)
                for row in realAccounts {
                    outbox.enqueue(
                        zoneName: CloudSyncOutbox.profileZone,
                        recordType: CloudSyncMapping.RecordType.realAccount,
                        recordName: row.id
                    )
                }
                let preferences = try LocalPreferenceRow
                    .filter(Column("scope_type") == "ledger")
                    .fetchAll(db)
                for row in preferences {
                    outbox.enqueue(
                        zoneName: CloudSyncOutbox.profileZone,
                        recordType: CloudSyncMapping.RecordType.userPreference,
                        recordName: row.id
                    )
                }
            }
        } catch {
            status.update(.error, message: error.localizedDescription)
        }
        let ledgerIds = (try? await LocalLedgerRepository(database: database).ledgerIds()) ?? []
        for ledgerId in ledgerIds {
            await enqueueLedgerZone(ledgerId: ledgerId)
        }
        tick()
    }

    // MARK: - State persistence (the official interface)

    private func persistState(_ serialization: CKSyncEngine.State.Serialization) {
        guard let url = Self.stateFileURL else { return }
        do {
            try FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(), withIntermediateDirectories: true
            )
            let data = try JSONEncoder().encode(serialization)
            // Atomic replace: a torn state file must never exist (R1).
            try data.write(to: url, options: .atomic)
        } catch {
            status.update(.error, message: error.localizedDescription)
        }
    }

    private static func readStateSerialization() -> CKSyncEngine.State.Serialization? {
        guard let url = stateFileURL, let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(CKSyncEngine.State.Serialization.self, from: data)
    }

    // MARK: - Record provider (nextRecordZoneChangeBatch's row loader)

    /// Loads the CKRecord for one pending save. Unknown record names (a
    /// pending change whose row has since been deleted locally) convert
    /// to deletes — the cloud copy must go with it.
    private func record(for recordID: CKRecord.ID) async -> CKRecord? {
        guard let database else { return nil }
        let recordName = recordID.recordName
        guard let (zoneName, recordType) = recordTypeByRecordName.get(recordName) else {
            return nil
        }
        let zoneID = CKRecordZone.ID(zoneName: zoneName, ownerName: CKCurrentUserDefaultName)
        do {
            return try await database.writer.read { db in
                Self.loadRecord(
                    recordName: recordName, recordType: recordType, zoneID: zoneID, db: db
                )
            }
        } catch {
            return nil
        }
    }

    nonisolated private static func loadRecord(
        recordName: String, recordType: String, zoneID: CKRecordZone.ID, db: Database
    ) -> CKRecord? {
        switch recordType {
        case CloudSyncMapping.RecordType.ledger:
            return try? LocalLedgerRow.fetchOne(db, key: recordName).map { CloudSyncMapping.encode($0, zoneID: zoneID) }
        case CloudSyncMapping.RecordType.ledgerMember:
            return try? LocalLedgerMemberRow.fetchOne(db, key: recordName).map { CloudSyncMapping.encode($0, zoneID: zoneID) }
        case CloudSyncMapping.RecordType.bookAccount:
            return try? LocalBookAccountRow.fetchOne(db, key: recordName).map { CloudSyncMapping.encode($0, zoneID: zoneID) }
        case CloudSyncMapping.RecordType.journalEntry:
            return try? LocalJournalEntryRow.fetchOne(db, key: recordName).map { CloudSyncMapping.encode($0, zoneID: zoneID) }
        case CloudSyncMapping.RecordType.journalLine:
            return try? LocalJournalLineRow.fetchOne(db, key: recordName).map { CloudSyncMapping.encode($0, zoneID: zoneID) }
        case CloudSyncMapping.RecordType.entryParticipant:
            return try? LocalEntryParticipantRow.fetchOne(db, key: recordName).map { CloudSyncMapping.encode($0, zoneID: zoneID) }
        case CloudSyncMapping.RecordType.project:
            return try? LocalProjectRow.fetchOne(db, key: recordName).map { CloudSyncMapping.encode($0, zoneID: zoneID) }
        case CloudSyncMapping.RecordType.projectMember:
            return try? LocalProjectMemberRow.fetchOne(db, key: recordName).map { CloudSyncMapping.encode($0, zoneID: zoneID) }
        case CloudSyncMapping.RecordType.budgetYear:
            return try? LocalBudgetYearRow.fetchOne(db, key: recordName).map { CloudSyncMapping.encode($0, zoneID: zoneID) }
        case CloudSyncMapping.RecordType.budgetMonthOverride:
            return try? LocalBudgetMonthOverrideRow.fetchOne(db, key: recordName).map { CloudSyncMapping.encode($0, zoneID: zoneID) }
        case CloudSyncMapping.RecordType.categoryBudgetYear:
            return try? LocalCategoryBudgetRow.fetchOne(db, key: recordName).map { CloudSyncMapping.encode($0, zoneID: zoneID) }
        case CloudSyncMapping.RecordType.userPreference:
            return try? LocalPreferenceRow.fetchOne(db, key: recordName).map { CloudSyncMapping.encode($0, zoneID: zoneID) }
        case CloudSyncMapping.RecordType.realAccount:
            return try? LocalRealAccountRow.fetchOne(db, key: recordName).map { CloudSyncMapping.encode($0, zoneID: zoneID) }
        case CloudSyncMapping.RecordType.attachment:
            guard let row = try? LocalAttachmentRow.fetchOne(db, key: recordName) else { return nil }
            var asset: CKAsset?
            if let directory = try? LocalAttachmentStore.directory(),
               FileManager.default.fileExists(atPath: directory.appendingPathComponent(row.filePath).path) {
                asset = CKAsset(fileURL: directory.appendingPathComponent(row.filePath))
            }
            return CloudSyncMapping.encode(row, zoneID: zoneID, asset: asset)
        default:
            return nil
        }
    }

    // MARK: - Fetched-change application

    /// Applies one fetched record (upsert by stable id). Attachment
    /// records also write their CKAsset bytes into the attachments
    /// directory. Fetched applies never re-enqueue sends — the write
    /// repositories are the only outbox feed.
    nonisolated private static func applyRecord(_ record: CKRecord, db: Database) {
        switch record.recordType {
        case CloudSyncMapping.RecordType.ledger:
            if let row = CloudSyncMapping.decodeLedger(record) { try? row.save(db) }
        case CloudSyncMapping.RecordType.ledgerMember:
            if let row = CloudSyncMapping.decodeLedgerMember(record) { try? row.save(db) }
        case CloudSyncMapping.RecordType.bookAccount:
            if let row = CloudSyncMapping.decodeBookAccount(record) { try? row.save(db) }
        case CloudSyncMapping.RecordType.journalEntry:
            if let row = CloudSyncMapping.decodeJournalEntry(record) { try? row.save(db) }
        case CloudSyncMapping.RecordType.journalLine:
            if let row = CloudSyncMapping.decodeJournalLine(record) { try? row.save(db) }
        case CloudSyncMapping.RecordType.entryParticipant:
            if let row = CloudSyncMapping.decodeEntryParticipant(record) { try? row.save(db) }
        case CloudSyncMapping.RecordType.project:
            if let row = CloudSyncMapping.decodeProject(record) { try? row.save(db) }
        case CloudSyncMapping.RecordType.projectMember:
            if let row = CloudSyncMapping.decodeProjectMember(record) { try? row.save(db) }
        case CloudSyncMapping.RecordType.budgetYear:
            if let row = CloudSyncMapping.decodeBudgetYear(record) { try? row.save(db) }
        case CloudSyncMapping.RecordType.budgetMonthOverride:
            if let row = CloudSyncMapping.decodeBudgetMonthOverride(record) { try? row.save(db) }
        case CloudSyncMapping.RecordType.categoryBudgetYear:
            if let row = CloudSyncMapping.decodeCategoryBudget(record) { try? row.save(db) }
        case CloudSyncMapping.RecordType.userPreference:
            if let row = CloudSyncMapping.decodeUserPreference(record) { try? row.save(db) }
        case CloudSyncMapping.RecordType.realAccount:
            if let row = CloudSyncMapping.decodeRealAccount(record) { try? row.save(db) }
        case CloudSyncMapping.RecordType.attachment:
            guard let row = CloudSyncMapping.decodeAttachment(record) else { return }
            // The bytes: write the fetched asset into the attachments
            // directory before the row lands.
            if let asset = record["file"] as? CKAsset,
               let source = asset.fileURL,
               let data = try? Data(contentsOf: source),
               let directory = try? LocalAttachmentStore.directory() {
                try? data.write(
                    to: directory.appendingPathComponent(row.filePath),
                    options: .atomic
                )
            }
            try? row.save(db)
        default:
            break
        }
    }

    /// Deletes rows by record name (fetched deletions, including a
    /// cascade's remote echo).
    nonisolated private static func applyDeletion(recordID: CKRecord.ID, db: Database) {
        let recordName = recordID.recordName
        _ = try? LocalLedgerRow.deleteOne(db, key: recordName)
        _ = try? LocalLedgerMemberRow.deleteOne(db, key: recordName)
        _ = try? LocalBookAccountRow.deleteOne(db, key: recordName)
        _ = try? LocalJournalEntryRow.deleteOne(db, key: recordName)
        _ = try? LocalJournalLineRow.deleteOne(db, key: recordName)
        _ = try? LocalEntryParticipantRow.deleteOne(db, key: recordName)
        _ = try? LocalProjectRow.deleteOne(db, key: recordName)
        _ = try? LocalProjectMemberRow.deleteOne(db, key: recordName)
        _ = try? LocalBudgetYearRow.deleteOne(db, key: recordName)
        _ = try? LocalBudgetMonthOverrideRow.deleteOne(db, key: recordName)
        _ = try? LocalCategoryBudgetRow.deleteOne(db, key: recordName)
        _ = try? LocalPreferenceRow.deleteOne(db, key: recordName)
        _ = try? LocalRealAccountRow.deleteOne(db, key: recordName)
        _ = try? LocalAttachmentRow.deleteOne(db, key: recordName)
    }
}

/// A tiny Sendable locked dictionary for the provider's type map.
nonisolated final class LockedDictionary<Key: Hashable, Value>: Sendable {
    private let lock = NSLock()
    private var storage: [Key: Value] = [:]

    func set(_ key: Key, _ value: Value) {
        lock.lock()
        defer { lock.unlock() }
        storage[key] = value
    }

    func get(_ key: Key) -> Value? {
        lock.lock()
        defer { lock.unlock() }
        return storage[key]
    }
}

// MARK: - CKSyncEngineDelegate

extension CloudSyncEngine: CKSyncEngineDelegate {
    /// The engine's event pump: state persists, status surfaces, fetched
    /// changes apply, sent changes clean up. Every branch ends with a
    /// `tick()` — write hooks land while sends run.
    func handleEvent(_ event: CKSyncEngine.Event, syncEngine: CKSyncEngine) async {
        switch event {
        case .stateUpdate(let event):
            // R1's whole point: the engine hands us its serialized state —
            // persist it atomically, touch nothing else about it.
            persistState(event.stateSerialization)

        case .accountChange(let event):
            switch event.changeType {
            case .signIn, .switchAccounts:
                // 重登录 → 自动续传: a fresh account gets the full enqueue
                // (the engine's state was persisted under the previous
                // account — the resend is idempotent overwrites).
                await fullEnqueueIfFirstRun(savedExists: false)
                status.update(.idle)
            case .signOut:
                // 登出 iCloud → 停同步保留本地数据.
                status.update(.icloudUnavailable)
            }

        case .willFetchChanges, .willSendChanges, .willFetchRecordZoneChanges:
            status.update(.syncing)

        case .didFetchChanges, .didSendChanges, .didFetchRecordZoneChanges:
            status.update(.idle)

        case .fetchedRecordZoneChanges(let event):
            if let database {
                do {
                    try await database.writer.write { db in
                        for modification in event.modifications {
                            Self.applyRecord(modification.record, db: db)
                        }
                        for deletion in event.deletions {
                            Self.applyDeletion(recordID: deletion.recordID, db: db)
                        }
                    }
                    // Another device may have created a ledger (its ledger
                    // record just landed) — refresh the routing registry
                    // and the widget mirror so the switcher sees it.
                    await LocalStoreGateway.shared.refreshRegistry()
                    WidgetSyncReloadHook.reload()
                } catch {
                    status.update(.error, message: error.localizedDescription)
                }
            }

        case .sentRecordZoneChanges(let event):
            // Receipts that made it to the server clear their pending flag
            // (Q2② — the 空间不足 surface counts the rest).
            let savedIds = Set(event.savedRecords.map(\.recordID.recordName))
            let quota = event.failedRecordSaves.contains {
                ($0.error as? CKError)?.code == .quotaExceeded
            }
            if quota {
                status.update(.quotaExceeded)
            }
            if !savedIds.isEmpty, let database {
                let marks = savedIds
                try? await database.writer.write { db in
                    for id in marks {
                        try? db.execute(
                            sql: "UPDATE qianlai_entry_attachment SET pending_sync = 0 WHERE id = ?",
                            arguments: [id]
                        )
                    }
                }
            }

        case .fetchedDatabaseChanges, .sentDatabaseChanges:
            // Zone discovery (another device's new ledger zone) rides the
            // engine's automatic fetch; nothing to apply here.
            break
        }
        tick()
    }

    /// The engine's send-batch builder: resolve pending saves into records
    /// (a vanished row converts to a cloud delete), cap the batch.
    func nextRecordZoneChangeBatch(
        _ context: CKSyncEngine.SendChangesContext,
        syncEngine: CKSyncEngine
    ) async -> CKSyncEngine.RecordZoneChangeBatch? {
        let pending = Array(syncEngine.state.pendingRecordZoneChanges.prefix(Self.batchSize))
        return await CKSyncEngine.RecordZoneChangeBatch(pendingChanges: pending) { recordID in
            await self.record(for: recordID)
        }
    }
}

/// WidgetKit reload without importing WidgetKit into the shared sources —
/// the same seam `WidgetSync` serves on the app side; the engine lives in
/// QianlaiShared, so the reload rides a closure the app installs.
@MainActor
enum WidgetSyncReloadHook {
    nonisolated(unsafe) static var reload: () -> Void = {}
}
