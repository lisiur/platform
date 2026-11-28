//
//  CloudSyncMapping.swift
//  Qianlai
//

import CloudKit
import Foundation

// =============================================================================
// CLOUDKIT RECORD SCHEMA v1 — FIELD FREEZE (C4)
//
// One recordType per table; recordName = the row id (stable TEXT ids —
// the same value doubles as the transfer document key). Every record
// carries `schemaVersion` (Int64, = 1). Structured evolution goes through
// the flex slots ONLY: `flexText1–3` (String), `flexInt1–3` (Int64),
// `flexDate1` (Date). New columns map onto a slot; a type change means a
// new recordType coexisting migration (never a live rewrite).
//
// recordType / fields (table columns verbatim; timestamps as native
// Date fields, JSON/array columns as their TEXT encoding):
//
//   ledger               id(ownerId name description currency status
//                        isDefault lastEntryNo budgetExcludedAccountIds
//                        createdAt updatedAt) + schemaVersion
//   ledgerMember         id ledgerId userId role createdAt
//   bookAccount          id ledgerId name code type sortOrder parentId
//                        status icon flags meta realAccountId createdAt
//                        updatedAt
//   journalEntry         id ledgerId entryNo date dateDayKey memo status
//                        countsInLedger guestCreated excludedFromBudget
//                        createdById paidById projectId address addressName
//                        latitude longitude merchant createdAt
//   journalLine          id entryId accountId debitCents creditCents memo
//   entryParticipant     id entryId userId createdAt
//   project              id ledgerId name description status startDate
//                        endDate createdAt updatedAt
//   projectMember        id projectId userId createdAt
//   budgetYear           id ledgerId year cents
//   budgetMonthOverride  id budgetYearId month cents
//   categoryBudgetYear   id ledgerId accountId year cents
//   userPreference       id userId scopeType scopeId data createdAt
//                        updatedAt
//   realAccount          id ownerId name type status icon meta createdAt
//                        updatedAt
//   attachment           id entryId mimeType size hash filePath createdAt
//                        pendingSync + `file` (CKAsset, the receipt bytes;
//                        entry records never carry bytes)
//
// All types additionally carry the flex slots above (declared but unused
// at v1 — CloudKit rejects unknown KEYS, not declared-empty slots).
// =============================================================================

/// The row ↔ CKRecord mappings (`CloudSyncMapping`'s mechanical half):
/// encode for send, decode for fetch-apply. Timestamps ride CKRecord's
/// native Date; the storage encoding converts at the row boundary via
/// `LocalValues`.
nonisolated enum CloudSyncMapping {
    /// recordType constants (C4's frozen names).
    enum RecordType {
        static let ledger = "ledger"
        static let ledgerMember = "ledgerMember"
        static let bookAccount = "bookAccount"
        static let journalEntry = "journalEntry"
        static let journalLine = "journalLine"
        static let entryParticipant = "entryParticipant"
        static let project = "project"
        static let projectMember = "projectMember"
        static let budgetYear = "budgetYear"
        static let budgetMonthOverride = "budgetMonthOverride"
        static let categoryBudgetYear = "categoryBudgetYear"
        static let userPreference = "userPreference"
        static let realAccount = "realAccount"
        static let attachment = "attachment"
    }

    static let schemaVersion: Int64 = 1

    // MARK: - Field helpers

    static func stampSchemaVersion(_ record: CKRecord) {
        record["schemaVersion"] = schemaVersion
    }

    private static func set(_ record: CKRecord, _ key: String, _ value: String?) {
        record[key] = value
    }

    private static func set(_ record: CKRecord, _ key: String, _ value: Int?) {
        record[key] = value.map { NSNumber(value: Int64($0)) }
    }

    private static func set(_ record: CKRecord, _ key: String, _ value: Bool?) {
        record[key] = value.map { NSNumber(value: $0) }
    }

    private static func set(_ record: CKRecord, _ key: String, _ value: Double?) {
        record[key] = value.map { NSNumber(value: $0) }
    }

    private static func set(_ record: CKRecord, _ key: String, _ value: Date?) {
        record[key] = value
    }

    private static func string(_ record: CKRecord, _ key: String) -> String? {
        record[key] as? String
    }

    private static func int(_ record: CKRecord, _ key: String) -> Int? {
        (record[key] as? NSNumber)?.intValue
    }

    private static func bool(_ record: CKRecord, _ key: String) -> Bool? {
        (record[key] as? NSNumber)?.boolValue
    }

    private static func double(_ record: CKRecord, _ key: String) -> Double? {
        (record[key] as? NSNumber)?.doubleValue
    }

    private static func date(_ record: CKRecord, _ key: String) -> Date? {
        record[key] as? Date
    }

    private static func timestampString(_ record: CKRecord, _ key: String) -> String? {
        date(record, key).map { LocalValues.timestamp(from: $0) }
    }

    /// Builds the record id inside a zone.
    static func recordID(_ recordName: String, zoneID: CKRecordZone.ID) -> CKRecord.ID {
        CKRecord.ID(recordName: recordName, zoneID: zoneID)
    }

    // MARK: - ledger

    static func encode(_ row: LocalLedgerRow, zoneID: CKRecordZone.ID) -> CKRecord {
        let record = CKRecord(recordType: RecordType.ledger, recordID: recordID(row.id, zoneID: zoneID))
        stampSchemaVersion(record)
        set(record, "ownerId", row.ownerId)
        set(record, "name", row.name)
        set(record, "description", row.description)
        set(record, "currency", row.currency)
        set(record, "status", row.status)
        set(record, "isDefault", row.isDefault)
        set(record, "lastEntryNo", row.lastEntryNo)
        set(record, "budgetExcludedAccountIds", row.budgetExcludedAccountIds)
        set(record, "createdAt", LocalValues.date(fromTimestamp: row.createdAt))
        set(record, "updatedAt", LocalValues.date(fromTimestamp: row.updatedAt))
        return record
    }

    static func decodeLedger(_ record: CKRecord) -> LocalLedgerRow? {
        guard let id = record.recordID.recordName as String?,
              let ownerId = string(record, "ownerId"),
              let name = string(record, "name"),
              let currency = string(record, "currency"),
              let status = string(record, "status")
        else { return nil }
        return LocalLedgerRow(
            id: id,
            ownerId: ownerId,
            name: name,
            description: string(record, "description"),
            currency: currency,
            status: status,
            isDefault: bool(record, "isDefault") ?? false,
            lastEntryNo: int(record, "lastEntryNo") ?? 0,
            budgetExcludedAccountIds: string(record, "budgetExcludedAccountIds") ?? "[]",
            createdAt: timestampString(record, "createdAt") ?? LocalValues.timestamp(from: Date()),
            updatedAt: timestampString(record, "updatedAt") ?? LocalValues.timestamp(from: Date())
        )
    }

    // MARK: - ledgerMember

    static func encode(_ row: LocalLedgerMemberRow, zoneID: CKRecordZone.ID) -> CKRecord {
        let record = CKRecord(recordType: RecordType.ledgerMember, recordID: recordID(row.id, zoneID: zoneID))
        stampSchemaVersion(record)
        set(record, "ledgerId", row.ledgerId)
        set(record, "userId", row.userId)
        set(record, "role", row.role)
        set(record, "createdAt", LocalValues.date(fromTimestamp: row.createdAt))
        return record
    }

    static func decodeLedgerMember(_ record: CKRecord) -> LocalLedgerMemberRow? {
        guard let id = record.recordID.recordName as String?,
              let ledgerId = string(record, "ledgerId"),
              let userId = string(record, "userId")
        else { return nil }
        return LocalLedgerMemberRow(
            id: id,
            ledgerId: ledgerId,
            userId: userId,
            role: string(record, "role") ?? "owner",
            createdAt: timestampString(record, "createdAt") ?? LocalValues.timestamp(from: Date())
        )
    }

    // MARK: - bookAccount

    static func encode(_ row: LocalBookAccountRow, zoneID: CKRecordZone.ID) -> CKRecord {
        let record = CKRecord(recordType: RecordType.bookAccount, recordID: recordID(row.id, zoneID: zoneID))
        stampSchemaVersion(record)
        set(record, "ledgerId", row.ledgerId)
        set(record, "name", row.name)
        set(record, "code", row.code)
        set(record, "type", row.type)
        set(record, "sortOrder", row.sortOrder)
        set(record, "parentId", row.parentId)
        set(record, "status", row.status)
        set(record, "icon", row.icon)
        set(record, "flags", row.flags)
        set(record, "meta", row.meta)
        set(record, "realAccountId", row.realAccountId)
        set(record, "createdAt", LocalValues.date(fromTimestamp: row.createdAt))
        set(record, "updatedAt", LocalValues.date(fromTimestamp: row.updatedAt))
        return record
    }

    static func decodeBookAccount(_ record: CKRecord) -> LocalBookAccountRow? {
        guard let id = record.recordID.recordName as String?,
              let ledgerId = string(record, "ledgerId"),
              let type = string(record, "type")
        else { return nil }
        return LocalBookAccountRow(
            id: id,
            ledgerId: ledgerId,
            name: string(record, "name"),
            code: string(record, "code"),
            type: type,
            sortOrder: int(record, "sortOrder") ?? 0,
            parentId: string(record, "parentId"),
            status: string(record, "status") ?? "active",
            icon: string(record, "icon"),
            flags: string(record, "flags") ?? "[]",
            meta: string(record, "meta"),
            realAccountId: string(record, "realAccountId"),
            createdAt: timestampString(record, "createdAt") ?? LocalValues.timestamp(from: Date()),
            updatedAt: timestampString(record, "updatedAt") ?? LocalValues.timestamp(from: Date())
        )
    }

    // MARK: - journalEntry

    static func encode(_ row: LocalJournalEntryRow, zoneID: CKRecordZone.ID) -> CKRecord {
        let record = CKRecord(recordType: RecordType.journalEntry, recordID: recordID(row.id, zoneID: zoneID))
        stampSchemaVersion(record)
        set(record, "ledgerId", row.ledgerId)
        set(record, "entryNo", row.entryNo)
        set(record, "date", LocalValues.date(fromTimestamp: row.date))
        set(record, "dateDayKey", row.dateDayKey)
        set(record, "memo", row.memo)
        set(record, "status", row.status)
        set(record, "countsInLedger", row.countsInLedger)
        set(record, "guestCreated", row.guestCreated)
        set(record, "excludedFromBudget", row.excludedFromBudget)
        set(record, "createdById", row.createdById)
        set(record, "paidById", row.paidById)
        set(record, "projectId", row.projectId)
        set(record, "address", row.address)
        set(record, "addressName", row.addressName)
        set(record, "latitude", row.latitude)
        set(record, "longitude", row.longitude)
        set(record, "merchant", row.merchant)
        set(record, "createdAt", LocalValues.date(fromTimestamp: row.createdAt))
        return record
    }

    static func decodeJournalEntry(_ record: CKRecord) -> LocalJournalEntryRow? {
        guard let id = record.recordID.recordName as String?,
              let ledgerId = string(record, "ledgerId")
        else { return nil }
        return LocalJournalEntryRow(
            id: id,
            ledgerId: ledgerId,
            entryNo: int(record, "entryNo") ?? 0,
            date: timestampString(record, "date") ?? LocalValues.timestamp(from: Date()),
            dateDayKey: string(record, "dateDayKey") ?? "",
            memo: string(record, "memo"),
            status: string(record, "status") ?? "posted",
            countsInLedger: bool(record, "countsInLedger") ?? true,
            guestCreated: bool(record, "guestCreated") ?? false,
            excludedFromBudget: bool(record, "excludedFromBudget") ?? false,
            createdById: string(record, "createdById"),
            paidById: string(record, "paidById"),
            projectId: string(record, "projectId"),
            address: string(record, "address"),
            addressName: string(record, "addressName"),
            latitude: double(record, "latitude"),
            longitude: double(record, "longitude"),
            merchant: string(record, "merchant"),
            createdAt: timestampString(record, "createdAt") ?? LocalValues.timestamp(from: Date())
        )
    }

    // MARK: - journalLine

    static func encode(_ row: LocalJournalLineRow, zoneID: CKRecordZone.ID) -> CKRecord {
        let record = CKRecord(recordType: RecordType.journalLine, recordID: recordID(row.id, zoneID: zoneID))
        stampSchemaVersion(record)
        set(record, "entryId", row.entryId)
        set(record, "accountId", row.accountId)
        set(record, "debitCents", row.debitCents)
        set(record, "creditCents", row.creditCents)
        set(record, "memo", row.memo)
        return record
    }

    static func decodeJournalLine(_ record: CKRecord) -> LocalJournalLineRow? {
        guard let id = record.recordID.recordName as String?,
              let entryId = string(record, "entryId"),
              let accountId = string(record, "accountId")
        else { return nil }
        return LocalJournalLineRow(
            id: id,
            entryId: entryId,
            accountId: accountId,
            debitCents: int(record, "debitCents") ?? 0,
            creditCents: int(record, "creditCents") ?? 0,
            memo: string(record, "memo")
        )
    }

    // MARK: - entryParticipant

    static func encode(_ row: LocalEntryParticipantRow, zoneID: CKRecordZone.ID) -> CKRecord {
        let record = CKRecord(recordType: RecordType.entryParticipant, recordID: recordID(row.id, zoneID: zoneID))
        stampSchemaVersion(record)
        set(record, "entryId", row.entryId)
        set(record, "userId", row.userId)
        set(record, "createdAt", LocalValues.date(fromTimestamp: row.createdAt))
        return record
    }

    static func decodeEntryParticipant(_ record: CKRecord) -> LocalEntryParticipantRow? {
        guard let id = record.recordID.recordName as String?,
              let entryId = string(record, "entryId"),
              let userId = string(record, "userId")
        else { return nil }
        return LocalEntryParticipantRow(
            id: id,
            entryId: entryId,
            userId: userId,
            createdAt: timestampString(record, "createdAt") ?? LocalValues.timestamp(from: Date())
        )
    }

    // MARK: - project

    static func encode(_ row: LocalProjectRow, zoneID: CKRecordZone.ID) -> CKRecord {
        let record = CKRecord(recordType: RecordType.project, recordID: recordID(row.id, zoneID: zoneID))
        stampSchemaVersion(record)
        set(record, "ledgerId", row.ledgerId)
        set(record, "name", row.name)
        set(record, "description", row.description)
        set(record, "status", row.status)
        set(record, "startDate", row.startDate.flatMap { LocalValues.date(fromTimestamp: $0) })
        set(record, "endDate", row.endDate.flatMap { LocalValues.date(fromTimestamp: $0) })
        set(record, "createdAt", LocalValues.date(fromTimestamp: row.createdAt))
        set(record, "updatedAt", LocalValues.date(fromTimestamp: row.updatedAt))
        return record
    }

    static func decodeProject(_ record: CKRecord) -> LocalProjectRow? {
        guard let id = record.recordID.recordName as String?,
              let ledgerId = string(record, "ledgerId"),
              let name = string(record, "name")
        else { return nil }
        return LocalProjectRow(
            id: id,
            ledgerId: ledgerId,
            name: name,
            description: string(record, "description"),
            status: string(record, "status") ?? "active",
            startDate: timestampString(record, "startDate"),
            endDate: timestampString(record, "endDate"),
            createdAt: timestampString(record, "createdAt") ?? LocalValues.timestamp(from: Date()),
            updatedAt: timestampString(record, "updatedAt") ?? LocalValues.timestamp(from: Date())
        )
    }

    // MARK: - projectMember

    static func encode(_ row: LocalProjectMemberRow, zoneID: CKRecordZone.ID) -> CKRecord {
        let record = CKRecord(recordType: RecordType.projectMember, recordID: recordID(row.id, zoneID: zoneID))
        stampSchemaVersion(record)
        set(record, "projectId", row.projectId)
        set(record, "userId", row.userId)
        set(record, "createdAt", LocalValues.date(fromTimestamp: row.createdAt))
        return record
    }

    static func decodeProjectMember(_ record: CKRecord) -> LocalProjectMemberRow? {
        guard let id = record.recordID.recordName as String?,
              let projectId = string(record, "projectId"),
              let userId = string(record, "userId")
        else { return nil }
        return LocalProjectMemberRow(
            id: id,
            projectId: projectId,
            userId: userId,
            createdAt: timestampString(record, "createdAt") ?? LocalValues.timestamp(from: Date())
        )
    }

    // MARK: - budgetYear / budgetMonthOverride / categoryBudgetYear

    static func encode(_ row: LocalBudgetYearRow, zoneID: CKRecordZone.ID) -> CKRecord {
        let record = CKRecord(recordType: RecordType.budgetYear, recordID: recordID(row.id, zoneID: zoneID))
        stampSchemaVersion(record)
        set(record, "ledgerId", row.ledgerId)
        set(record, "year", row.year)
        set(record, "cents", row.cents)
        return record
    }

    static func decodeBudgetYear(_ record: CKRecord) -> LocalBudgetYearRow? {
        guard let id = record.recordID.recordName as String?,
              let ledgerId = string(record, "ledgerId")
        else { return nil }
        return LocalBudgetYearRow(
            id: id,
            ledgerId: ledgerId,
            year: int(record, "year") ?? 0,
            cents: int(record, "cents") ?? 0
        )
    }

    static func encode(_ row: LocalBudgetMonthOverrideRow, zoneID: CKRecordZone.ID) -> CKRecord {
        let record = CKRecord(recordType: RecordType.budgetMonthOverride, recordID: recordID(row.id, zoneID: zoneID))
        stampSchemaVersion(record)
        set(record, "budgetYearId", row.budgetYearId)
        set(record, "month", row.month)
        set(record, "cents", row.cents)
        return record
    }

    static func decodeBudgetMonthOverride(_ record: CKRecord) -> LocalBudgetMonthOverrideRow? {
        guard let id = record.recordID.recordName as String?,
              let budgetYearId = string(record, "budgetYearId")
        else { return nil }
        return LocalBudgetMonthOverrideRow(
            id: id,
            budgetYearId: budgetYearId,
            month: int(record, "month") ?? 0,
            cents: int(record, "cents") ?? 0
        )
    }

    static func encode(_ row: LocalCategoryBudgetRow, zoneID: CKRecordZone.ID) -> CKRecord {
        let record = CKRecord(recordType: RecordType.categoryBudgetYear, recordID: recordID(row.id, zoneID: zoneID))
        stampSchemaVersion(record)
        set(record, "ledgerId", row.ledgerId)
        set(record, "accountId", row.accountId)
        set(record, "year", row.year)
        set(record, "cents", row.cents)
        return record
    }

    static func decodeCategoryBudget(_ record: CKRecord) -> LocalCategoryBudgetRow? {
        guard let id = record.recordID.recordName as String?,
              let ledgerId = string(record, "ledgerId"),
              let accountId = string(record, "accountId")
        else { return nil }
        return LocalCategoryBudgetRow(
            id: id,
            ledgerId: ledgerId,
            accountId: accountId,
            year: int(record, "year") ?? 0,
            cents: int(record, "cents") ?? 0
        )
    }

    // MARK: - userPreference

    static func encode(_ row: LocalPreferenceRow, zoneID: CKRecordZone.ID) -> CKRecord {
        let record = CKRecord(recordType: RecordType.userPreference, recordID: recordID(row.id, zoneID: zoneID))
        stampSchemaVersion(record)
        set(record, "userId", row.userId)
        set(record, "scopeType", row.scopeType)
        set(record, "scopeId", row.scopeId)
        set(record, "data", row.data)
        set(record, "createdAt", LocalValues.date(fromTimestamp: row.createdAt))
        set(record, "updatedAt", LocalValues.date(fromTimestamp: row.updatedAt))
        return record
    }

    static func decodeUserPreference(_ record: CKRecord) -> LocalPreferenceRow? {
        guard let id = record.recordID.recordName as String?,
              let userId = string(record, "userId"),
              let scopeType = string(record, "scopeType"),
              let data = string(record, "data")
        else { return nil }
        return LocalPreferenceRow(
            id: id,
            userId: userId,
            scopeType: scopeType,
            scopeId: string(record, "scopeId") ?? "",
            data: data,
            createdAt: timestampString(record, "createdAt") ?? LocalValues.timestamp(from: Date()),
            updatedAt: timestampString(record, "updatedAt") ?? LocalValues.timestamp(from: Date())
        )
    }

    // MARK: - realAccount

    static func encode(_ row: LocalRealAccountRow, zoneID: CKRecordZone.ID) -> CKRecord {
        let record = CKRecord(recordType: RecordType.realAccount, recordID: recordID(row.id, zoneID: zoneID))
        stampSchemaVersion(record)
        set(record, "ownerId", row.ownerId)
        set(record, "name", row.name)
        set(record, "type", row.type)
        set(record, "status", row.status)
        set(record, "icon", row.icon)
        set(record, "meta", row.meta)
        set(record, "createdAt", LocalValues.date(fromTimestamp: row.createdAt))
        set(record, "updatedAt", LocalValues.date(fromTimestamp: row.updatedAt))
        return record
    }

    static func decodeRealAccount(_ record: CKRecord) -> LocalRealAccountRow? {
        guard let id = record.recordID.recordName as String?,
              let ownerId = string(record, "ownerId"),
              let name = string(record, "name"),
              let type = string(record, "type")
        else { return nil }
        return LocalRealAccountRow(
            id: id,
            ownerId: ownerId,
            name: name,
            type: type,
            status: string(record, "status") ?? "active",
            icon: string(record, "icon"),
            meta: string(record, "meta"),
            createdAt: timestampString(record, "createdAt") ?? LocalValues.timestamp(from: Date()),
            updatedAt: timestampString(record, "updatedAt") ?? LocalValues.timestamp(from: Date())
        )
    }

    // MARK: - attachment (fields only — the CKAsset rides separately)

    static func encode(
        _ row: LocalAttachmentRow, zoneID: CKRecordZone.ID, asset: CKAsset? = nil
    ) -> CKRecord {
        let record = CKRecord(recordType: RecordType.attachment, recordID: recordID(row.id, zoneID: zoneID))
        stampSchemaVersion(record)
        set(record, "entryId", row.entryId)
        set(record, "mimeType", row.mimeType)
        set(record, "size", row.size)
        set(record, "hash", row.hash)
        set(record, "filePath", row.filePath)
        set(record, "createdAt", LocalValues.date(fromTimestamp: row.createdAt))
        set(record, "pendingSync", row.pendingSync)
        if let asset {
            record["file"] = asset
        }
        return record
    }

    static func decodeAttachment(_ record: CKRecord) -> LocalAttachmentRow? {
        guard let id = record.recordID.recordName as String?,
              let mimeType = string(record, "mimeType"),
              let filePath = string(record, "filePath")
        else { return nil }
        return LocalAttachmentRow(
            id: id,
            entryId: string(record, "entryId"),
            mimeType: mimeType,
            size: int(record, "size") ?? 0,
            hash: string(record, "hash") ?? "",
            filePath: filePath,
            createdAt: timestampString(record, "createdAt") ?? LocalValues.timestamp(from: Date()),
            pendingSync: bool(record, "pendingSync") ?? false
        )
    }
}
