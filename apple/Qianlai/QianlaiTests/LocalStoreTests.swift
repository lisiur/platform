//
//  LocalStoreTests.swift
//  QianlaiTests
//
//  The local store's own contracts (T1.3–T1.5): opening migrates (and
//  re-opening is idempotent), the ledger lifecycle works end to end on an
//  in-memory database, the seed matches the server's starter fixture
//  field by field, and the C1 decode fallback holds for pre-field
//  payloads.
//

import XCTest
@testable import Qianlai

final class LocalStoreTests: XCTestCase {
    private func makeDatabase() throws -> LocalDatabase {
        try LocalDatabase(inMemory: true)
    }

    // MARK: - Schema (T1.3)

    func testOpeningMigratesAndIsIdempotent() throws {
        let database = try makeDatabase()
        XCTAssertEqual(database.appliedMigrationCount, 2, "v1 (schema) + v2 (attachments) registered")
        // Re-opening the SAME FILE re-runs the migrator — a no-op, no throw
        // (GRDB records applied versions in grdb_migrations).
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("local-store-tests-\(UUID().uuidString).sqlite3")
        _ = try LocalDatabase(fileURL: url)
        let reopened = try LocalDatabase(fileURL: url)
        XCTAssertEqual(reopened.appliedMigrationCount, 2, "idempotent re-migration")
        try? FileManager.default.removeItem(at: url)
    }

    // MARK: - Ledger lifecycle (T1.5)

    func testCreateSeedListArchiveDeleteLifecycle() async throws {
        let database = try makeDatabase()
        let repository = LocalLedgerRepository(database: database)
        let ownerId = "install-identity"

        // Create — the owner member row and the seed land in one write.
        let created = try await repository.create(
            name: "个人账本",
            description: nil,
            currency: "CNY",
            seedStarterAccounts: true,
            ownerId: ownerId
        )
        XCTAssertEqual(created.storage, .local, "C1: local creations carry storage .local")
        XCTAssertEqual(created.myRole, .owner, "C1: local ledgers are always owner")
        XCTAssertEqual(created.membersCount, 1, "C1: local ledgers have exactly one member")
        XCTAssertFalse(created.shared, "C1: local ledgers never share")
        XCTAssertEqual(created.currency, "CNY")

        // List resolves it; the registry sees the id.
        let list = try await repository.list()
        XCTAssertEqual(list.map(\.id), [created.id])
        let ids = try await repository.ledgerIds()
        XCTAssertEqual(ids, [created.id])

        // Seed: 29 starter accounts, parentage resolved, default pocket flagged.
        let reportRepository = LocalReportRepository(database: database)
        let accounts = try await reportRepository.accounts(ledgerId: created.id)
        XCTAssertEqual(accounts.count, 29, "seed parity: 29 starter accounts")
        let defaultPocket = accounts.first { $0.code == "defaultAccount" }
        XCTAssertNotNil(defaultPocket)
        XCTAssertEqual(defaultPocket?.flags ?? [], [
            LocalSeed.builtinFlag, LocalSeed.defaultDebitFlag, LocalSeed.defaultCreditFlag,
        ])
        let meals = accounts.first { $0.code == "meals" }
        XCTAssertEqual(
            meals?.parentId,
            accounts.first { $0.code == "food" }?.id,
            "seed parity: meals rides the food parent"
        )
        XCTAssertNil(meals?.name, "seed parity: seeded accounts carry no name (code is the identity)")
        // Codes unique (the ledger+code unique index held at insert).
        XCTAssertEqual(Set(accounts.compactMap(\.code)).count, accounts.compactMap(\.code).count)

        // Archive toggle + unarchive.
        try await repository.setStatus(created.id, status: "archived")
        let archivedList = try await repository.list()
        XCTAssertEqual(archivedList.first?.status, "archived")
        try await repository.setStatus(created.id, status: "active")

        // Delete wipes the cascade (accounts gone with the ledger row).
        try await repository.delete(created.id)
        let listAfterDelete = try await repository.list()
        XCTAssertTrue(listAfterDelete.isEmpty)
        let accountsAfterDelete = try await reportRepository.accounts(ledgerId: created.id)
        XCTAssertTrue(accountsAfterDelete.isEmpty, "FK cascade: accounts leave with the ledger")

        // Registry forgets the id.
        let idsAfterDelete = try await repository.ledgerIds()
        XCTAssertTrue(idsAfterDelete.isEmpty)
    }

    func testCreateCurrencyDefaultsToCNYWhenInvalid() async throws {
        let database = try makeDatabase()
        let repository = LocalLedgerRepository(database: database)
        let created = try await repository.create(
            name: "账本",
            description: nil,
            currency: "cnyx",
            seedStarterAccounts: false,
            ownerId: "owner"
        )
        XCTAssertEqual(created.currency, "CNY", "a non-3-letter currency falls back like the cloud path")
    }

    func testSeedParityAgainstServerFixture() {
        // The server's STARTER_ACCOUNTS fixture (packages/service
        // bookkeeping/domain.ts), transcribed — the local seed must hold
        // these exact (code, type, sortOrder, icon, flags, parentCode)
        // tuples, in order. When the server fixture moves, this list moves.
        let serverFixture: [(code: String, type: AccountType, sortOrder: Int, icon: String, flags: [String], parent: String?)] = [
            ("defaultAccount", .asset, 5, "👛", [.builtin, .defaultDebit, .defaultCredit], nil),
            ("openingBalance", .equity, 60, "🧮", [.builtin, .adjustmentOffset], nil),
            ("salary", .income, 70, "💼", [], nil),
            ("bonus", .income, 80, "🏆", [], nil),
            ("overtime", .income, 90, "🌙", [], nil),
            ("benefits", .income, 100, "🪙", [], nil),
            ("redPacket", .income, 110, "🧧", [], nil),
            ("partTime", .income, 120, "🧑‍💻", [], nil),
            ("sideBusiness", .income, 130, "🚀", [], nil),
            ("taxRefund", .income, 140, "🧾", [], nil),
            ("investment", .income, 150, "📈", [], nil),
            ("windfall", .income, 160, "🎉", [], nil),
            ("otherIncome", .income, 170, "✨", [], nil),
            ("food", .expense, 200, "🍜", [], nil),
            ("meals", .expense, 201, "🍚", [], "food"),
            ("snacks", .expense, 202, "🍿", [], "food"),
            ("fruit", .expense, 203, "🍎", [], "food"),
            ("groceries", .expense, 204, "🥬", [], "food"),
            ("apparel", .expense, 210, "👕", [], nil),
            ("housing", .expense, 220, "🏠", [], nil),
            ("transport", .expense, 230, "🚌", [], nil),
            ("entertainment", .expense, 240, "🎬", [], nil),
            ("medical", .expense, 250, "🩺", [], nil),
            ("telecom", .expense, 260, "📱", [], nil),
            ("education", .expense, 270, "📚", [], nil),
            ("gifts", .expense, 280, "🎊", [], nil),
            ("childcare", .expense, 290, "🍼", [], nil),
            ("pets", .expense, 300, "🐾", [], nil),
            ("travel", .expense, 310, "✈️", [], nil),
        ]
        XCTAssertEqual(LocalSeed.accounts.count, serverFixture.count)
        for (index, expected) in serverFixture.enumerated() {
            let seeded = LocalSeed.accounts[index]
            XCTAssertEqual(seeded.code, expected.code, "row \(index) code")
            XCTAssertEqual(seeded.type, expected.type, "row \(index) type")
            XCTAssertEqual(seeded.sortOrder, expected.sortOrder, "row \(index) sortOrder")
            XCTAssertEqual(seeded.icon, expected.icon, "row \(index) icon")
            XCTAssertEqual(seeded.flags, expected.flags, "row \(index) flags")
            XCTAssertEqual(seeded.parentCode, expected.parent, "row \(index) parent")
        }
    }

    // MARK: - C1 decode fallback

    func testLedgerDecodeDefaultsToCloudWhenStorageMissing() throws {
        let json = """
        {"id":"l1","ownerId":"u1","name":"云账本","description":null,"currency":"CNY",
         "status":"active","isDefault":false,"createdAt":0,"updatedAt":0,
         "myRole":"owner","membersCount":1,"shared":false}
        """
        let ledger = try JSONDecoder().decode(QianlaiLedger.self, from: Data(json.utf8))
        XCTAssertEqual(ledger.storage, .cloud, "C1: pre-field payloads decode as cloud")
        XCTAssertFalse(ledger.isLocal)
    }

    func testLedgerDecodeFallsBackToCloudOnMalformedStorage() throws {
        let json = """
        {"id":"l1","ownerId":"u1","name":"账本","currency":"CNY","status":"active",
         "isDefault":false,"createdAt":0,"updatedAt":0,"myRole":"owner",
         "membersCount":1,"shared":false,"storage":"floppy"}
        """
        let ledger = try JSONDecoder().decode(QianlaiLedger.self, from: Data(json.utf8))
        XCTAssertEqual(ledger.storage, .cloud, "C1: malformed storage values degrade to cloud")
    }

    func testLedgerStorageRoundTripEncodesRawValue() throws {
        let ledger = QianlaiLedger(
            id: "l1", ownerId: "u1", name: "本地", description: nil, currency: "CNY",
            status: "active", isDefault: false, createdAt: Date(), updatedAt: Date(),
            myRole: .owner, membersCount: 1, shared: false, storage: .local
        )
        let data = try JSONEncoder().encode(ledger)
        let decoded = try JSONDecoder().decode(QianlaiLedger.self, from: data)
        XCTAssertEqual(decoded, ledger)
        XCTAssertTrue(String(data: data, encoding: .utf8)?.contains("\"storage\":\"local\"") ?? false,
                      "storage encodes as its rawValue string")
    }

    // MARK: - Timestamps

    func testTimestampRoundTripAndFixedFormat() throws {
        let date = Date(timeIntervalSince1970: 1_764_602_400.123)
        let text = LocalValues.timestamp(from: date)
        XCTAssertTrue(text.hasSuffix("Z"), "UTC-suffixed ISO8601: \(text)")
        XCTAssertTrue(text.contains("."), "fractional seconds present: \(text)")
        // Fixed width: every UTC instant renders the same length, so the
        // lexicographic date comparisons in the SQL reads stay chronological.
        let other = LocalValues.timestamp(from: Date(timeIntervalSince1970: 0))
        XCTAssertEqual(text.count, other.count, "fixed-width encoding for date comparisons")
        let parsed = try XCTUnwrap(LocalValues.date(fromTimestamp: text))
        XCTAssertEqual(parsed.timeIntervalSince1970, 1_764_602_400.123, accuracy: 0.001)
        // No-fraction strings still parse.
        XCTAssertNotNil(LocalValues.date(fromTimestamp: "2026-01-02T03:04:05Z"))
    }

    func testCentsConversionMatchesServerRounding() {
        // Math.round(x * 100) semantics on both sides.
        XCTAssertEqual(LocalValues.cents(fromYuan: 12.34), 1234)
        XCTAssertEqual(LocalValues.cents(fromYuan: 10.005), 1001, "half rounds away from zero, like Math.round")
        XCTAssertEqual(LocalValues.cents(fromYuan: -10.005), -1001)
        XCTAssertEqual(LocalValues.yuan(fromCents: 1234), 12.34)
    }
}

// The flag tuple in the parity fixture reads better with operator sugar on
// the flag strings — local to this file.
private extension String {
    static let builtin = "builtin"
    static let defaultDebit = "defaultDebit"
    static let defaultCredit = "defaultCredit"
    static let adjustmentOffset = "adjustmentOffset"
}
