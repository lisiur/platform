//
//  CloudSyncTests.swift
//  QianlaiTests
//
//  The sync layer's offline-testable contracts (T2.3): the C4 record
//  mapping round-trips every row type through a real CKRecord (fields,
//  optionals, timestamps), the outbox drains deletions before sends with
//  stable dedup, and the external-content FTS index stays aligned with
//  the entry table (insert/update/delete triggers) so a future MATCH-based
//  search reads the same rows the LIKE search does.
//

import CloudKit
import XCTest
@testable import Qianlai

final class CloudSyncTests: XCTestCase {
    private let zoneID = CKRecordZone.ID(zoneName: "qianlai-ledger-test", ownerName: CKCurrentUserDefaultName)

    private func makeDatabase() throws -> LocalDatabase {
        try LocalDatabase(inMemory: true)
    }

    // MARK: - Mapping round trips (C4)

    func testLedgerRowRoundTripsThroughRecord() {
        let row = LocalLedgerRow(
            id: "l1", ownerId: "u1", name: "本地账本", description: "备注",
            currency: "CNY", status: "active", isDefault: true, lastEntryNo: 7,
            budgetExcludedAccountIds: "[\"food\"]",
            createdAt: LocalValues.timestamp(from: Date(timeIntervalSince1970: 1_000)),
            updatedAt: LocalValues.timestamp(from: Date(timeIntervalSince1970: 2_000))
        )
        let record = CloudSyncMapping.encode(row, zoneID: zoneID)
        XCTAssertEqual(record.recordType, "ledger")
        XCTAssertEqual(record.recordID.recordName, "l1")
        XCTAssertEqual(record.recordID.zoneID, zoneID)
        XCTAssertEqual((record["schemaVersion"] as? NSNumber)?.int64Value, 1)
        let decoded = CloudSyncMapping.decodeLedger(record)
        XCTAssertEqual(decoded, row)
    }

    func testJournalEntryRowRoundTripsThroughRecord() {
        let row = LocalJournalEntryRow(
            id: "e1", ledgerId: "l1", entryNo: 3,
            date: LocalValues.timestamp(from: Date(timeIntervalSince1970: 1_760_000_000)),
            dateDayKey: "2026-01-15", memo: "午餐", status: "posted",
            countsInLedger: true, guestCreated: false, excludedFromBudget: true,
            createdById: "me", paidById: "me", projectId: nil,
            address: " somewhere ", addressName: "全家",
            latitude: 31.23, longitude: 121.47, merchant: "全家",
            createdAt: LocalValues.timestamp(from: Date(timeIntervalSince1970: 1_760_000_100))
        )
        let record = CloudSyncMapping.encode(row, zoneID: zoneID)
        XCTAssertEqual(record.recordType, "journalEntry")
        // The typed fields land as CloudKit natives.
        XCTAssertEqual(record["entryNo"] as? Int, 3)
        XCTAssertNotNil(record["date"] as? Date, "timestamps ride CKRecord's native Date")
        XCTAssertEqual(record["countsInLedger"] as? Bool ?? false, true)
        XCTAssertNil(record["projectId"], "optional nil fields stay absent")
        XCTAssertEqual(CloudSyncMapping.decodeJournalEntry(record), row)
    }

    func testJournalLineAndParticipantRoundTrip() {
        let line = LocalJournalLineRow(
            id: "line1", entryId: "e1", accountId: "food",
            debitCents: 4_200, creditCents: 0, memo: nil
        )
        XCTAssertEqual(CloudSyncMapping.decodeJournalLine(CloudSyncMapping.encode(line, zoneID: zoneID)), line)
        let participant = LocalEntryParticipantRow(
            id: "p1", entryId: "e1", userId: "me",
            createdAt: LocalValues.timestamp(from: Date())
        )
        XCTAssertEqual(
            CloudSyncMapping.decodeEntryParticipant(CloudSyncMapping.encode(participant, zoneID: zoneID)),
            participant
        )
    }

    func testAccountAndBudgetAndProjectRowsRoundTrip() {
        let account = LocalBookAccountRow(
            id: "a1", ledgerId: "l1", name: nil, code: "food", type: "expense",
            sortOrder: 200, parentId: nil, status: "active", icon: "🍜",
            flags: "[\"builtin\"]", meta: nil, realAccountId: nil,
            createdAt: LocalValues.timestamp(from: Date()), updatedAt: LocalValues.timestamp(from: Date())
        )
        XCTAssertEqual(CloudSyncMapping.decodeBookAccount(CloudSyncMapping.encode(account, zoneID: zoneID)), account)

        let year = LocalBudgetYearRow(id: "y1", ledgerId: "l1", year: 2026, cents: 60_000)
        XCTAssertEqual(CloudSyncMapping.decodeBudgetYear(CloudSyncMapping.encode(year, zoneID: zoneID)), year)
        let override = LocalBudgetMonthOverrideRow(id: "m1", budgetYearId: "y1", month: 3, cents: 40_000)
        XCTAssertEqual(
            CloudSyncMapping.decodeBudgetMonthOverride(CloudSyncMapping.encode(override, zoneID: zoneID)),
            override
        )
        let category = LocalCategoryBudgetRow(id: "c1", ledgerId: "l1", accountId: "a1", year: 2026, cents: 90_000)
        XCTAssertEqual(
            CloudSyncMapping.decodeCategoryBudget(CloudSyncMapping.encode(category, zoneID: zoneID)),
            category
        )

        let project = LocalProjectRow(
            id: "p1", ledgerId: "l1", name: "旅行", description: nil, status: "active",
            startDate: nil, endDate: nil,
            createdAt: LocalValues.timestamp(from: Date()), updatedAt: LocalValues.timestamp(from: Date())
        )
        XCTAssertEqual(CloudSyncMapping.decodeProject(CloudSyncMapping.encode(project, zoneID: zoneID)), project)
        let member = LocalProjectMemberRow(
            id: "pm1", projectId: "p1", userId: "me", createdAt: LocalValues.timestamp(from: Date())
        )
        XCTAssertEqual(
            CloudSyncMapping.decodeProjectMember(CloudSyncMapping.encode(member, zoneID: zoneID)),
            member
        )

        let real = LocalRealAccountRow(
            id: "r1", ownerId: "me", name: "工资卡", type: "asset", status: "active",
            icon: "💳", meta: nil,
            createdAt: LocalValues.timestamp(from: Date()), updatedAt: LocalValues.timestamp(from: Date())
        )
        XCTAssertEqual(CloudSyncMapping.decodeRealAccount(CloudSyncMapping.encode(real, zoneID: zoneID)), real)

        let preference = LocalPreferenceRow(
            id: "pref1", userId: "me", scopeType: "ledger", scopeId: "l1",
            data: "{\"quickEntry\":{\"chipFields\":[]}}",
            createdAt: LocalValues.timestamp(from: Date()), updatedAt: LocalValues.timestamp(from: Date())
        )
        XCTAssertEqual(
            CloudSyncMapping.decodeUserPreference(CloudSyncMapping.encode(preference, zoneID: zoneID)),
            preference
        )

        let receipt = LocalAttachmentRow(
            id: "at1", entryId: "e1", mimeType: "image/jpeg", size: 42,
            hash: "deadbeef", filePath: "at1.jpg",
            createdAt: LocalValues.timestamp(from: Date()), pendingSync: true
        )
        let receiptRecord = CloudSyncMapping.encode(receipt, zoneID: zoneID)
        XCTAssertEqual(receiptRecord.recordType, "attachment")
        XCTAssertNil(receiptRecord["file"] as? CKAsset, "no asset on encode without bytes — the engine supplies it")
        XCTAssertEqual(CloudSyncMapping.decodeAttachment(receiptRecord), receipt)
    }

    func testDecodeRejectsForeignRecords() {
        // A record of another type must not decode as a ledger.
        let record = CKRecord(recordType: "someOtherType", recordID: CloudSyncMapping.recordID("x", zoneID: zoneID))
        XCTAssertNil(CloudSyncMapping.decodeLedger(record))
    }

    // MARK: - Outbox

    func testOutboxDrainsDeletionsBeforeSendsAndDedupes() {
        let outbox = CloudSyncOutbox.shared
        // Order the drain asserts rely on: start from a clean slate — the
        // engine may have drained earlier tests' items, drain once first.
        _ = outbox.drain()
        outbox.enqueue(zoneName: "z1", recordType: "journalEntry", recordName: "e1")
        outbox.enqueue(zoneName: "z1", recordType: "journalEntry", recordName: "e1") // duplicate
        outbox.enqueue(zoneName: "z1", recordType: "journalLine", recordName: "l1")
        outbox.enqueueDeletion(zoneName: "z1", recordType: "journalEntry", recordName: "e2")
        outbox.enqueueZoneDeletion("z2")

        let drained = outbox.drain()
        XCTAssertEqual(drained.zoneDeletions, ["z2"], "zone deletions ride first")
        XCTAssertEqual(drained.recordDeletions.map(\.recordName), ["e2"])
        XCTAssertEqual(drained.changes.map(\.recordName), ["e1", "l1"], "deduped in order")
        // Everything is consumed.
        let second = outbox.drain()
        XCTAssertTrue(second.zoneDeletions.isEmpty)
        XCTAssertTrue(second.recordDeletions.isEmpty)
        XCTAssertTrue(second.changes.isEmpty)
    }

    func testZoneDeletionSweepsPendingSendsForThatZone() {
        let outbox = CloudSyncOutbox.shared
        _ = outbox.drain()
        outbox.enqueue(zoneName: "qianlai-ledger-gone", recordType: "journalEntry", recordName: "e1")
        outbox.enqueueZoneDeletion("qianlai-ledger-gone")
        let drained = outbox.drain()
        XCTAssertTrue(drained.changes.isEmpty, "sends for a deleted zone drop out")
        XCTAssertEqual(drained.zoneDeletions, ["qianlai-ledger-gone"])
    }

    // MARK: - FTS alignment (external-content index)

    func testFTSIndexStaysAlignedWithEntryWrites() async throws {
        let database = try makeDatabase()
        let write = LocalJournalWriteRepository(database: database)
        let ledgerRepository = LocalLedgerRepository(database: database)
        let ledger = try await ledgerRepository.create(
            name: "账本", description: nil, currency: "CNY",
            seedStarterAccounts: true, ownerId: "me"
        )
        let accounts = try await LocalReportRepository(database: database).accounts(ledgerId: ledger.id)
        let meals = try XCTUnwrap(accounts.first { $0.code == "meals" })
        let pocket = try XCTUnwrap(accounts.first { $0.code == "defaultAccount" })
        let draft = LocalJournalWriteRepository.EntryDraft(
            date: Date(), memo: "中午吃面",
            lines: [(meals.id, 12.0, 0, nil), (pocket.id, 0, 12.0, nil)],
            participantUserIds: nil, paidByUserId: nil, projectId: nil,
            countsInLedger: true, excludedFromBudget: false,
            location: nil, merchant: "面馆", attachmentIds: nil
        )
        let entry = try await write.createEntry(ledgerId: ledger.id, creatorId: "me", draft: draft)

        // The external-content index aligns with the row — but ONLY by
        // whole token: unicode61 makes one contiguous CJK run a single
        // token, so the full memo matches while a single character does
        // not. This is the R4 evaluation's answer: unicode61 provides NO
        // per-character Chinese recall; the read path's LIKE search is
        // load-bearing for Chinese (AC2.4's allowed degradation), and a
        // future MATCH-based search would need a CJK-aware tokenizer.
        let wholeToken = try await database.writer.read { db in
            try Int.fetchOne(
                db,
                sql: """
                    SELECT COUNT(*) FROM journal_entry_fts
                    WHERE journal_entry_fts MATCH ?
                    """,
                arguments: ["中午吃面"]
            ) ?? -1
        }
        XCTAssertEqual(wholeToken, 1, "whole-token match hits (the index is aligned)")
        let singleChar = try await database.writer.read { db in
            try Int.fetchOne(
                db,
                sql: "SELECT COUNT(*) FROM journal_entry_fts WHERE journal_entry_fts MATCH ?",
                arguments: ["面"]
            ) ?? -1
        }
        XCTAssertEqual(singleChar, 0, "unicode61 does not split CJK: per-char recall needs the LIKE path")

        // Delete removes the index row (the trigger pair holds).
        try await write.deleteEntry(ledgerId: ledger.id, entryId: entry.id)
        let afterDelete = try await database.writer.read { db in
            try Int.fetchOne(
                db,
                sql: "SELECT COUNT(*) FROM journal_entry_fts WHERE journal_entry_fts MATCH ?",
                arguments: ["中午吃面"]
            ) ?? -1
        }
        XCTAssertEqual(afterDelete, 0, "the delete trigger cleaned the index")
    }
}
