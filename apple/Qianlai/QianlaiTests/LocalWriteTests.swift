//
//  LocalWriteTests.swift
//  QianlaiTests
//
//  The phase-2 write path (T2.1/T2.4): validation mirrors the server's
//  rules line by line, the entry lifecycle keeps entryNo monotonic and
//  the update keep-rules, the balance adjustment posts a balanced entry
//  against the offset account, the budget settings writes honor the
//  server's guards, and photo receipts stage → claim → prune.
//

import XCTest
@testable import Qianlai

final class LocalWriteTests: XCTestCase {
    private func makeDatabase() throws -> LocalDatabase {
        try LocalDatabase(inMemory: true)
    }

    /// A ledger with the seeded chart + the local identity as its member.
    private func makeLedger(
        database: LocalDatabase,
        ownerId: String = "me"
    ) async throws -> String {
        let repository = LocalLedgerRepository(database: database)
        let ledger = try await repository.create(
            name: "测试账本", description: nil, currency: "CNY",
            seedStarterAccounts: true, ownerId: ownerId
        )
        return ledger.id
    }

    private func accounts(ledgerId: String, database: LocalDatabase) async throws -> [BookAccount] {
        try await LocalReportRepository(database: database).accounts(ledgerId: ledgerId)
    }

    private func draft(
        debitAccount: String?,
        creditAccount: String?,
        amount: Double,
        memo: String? = nil
    ) -> LocalJournalWriteRepository.EntryDraft {
        LocalJournalWriteRepository.EntryDraft(
            date: Date(timeIntervalSince1970: 1_760_000_000),
            memo: memo,
            lines: [
                (debitAccount, amount, 0, nil),
                (creditAccount, 0, amount, nil),
            ],
            participantUserIds: nil,
            paidByUserId: nil,
            projectId: nil,
            countsInLedger: true,
            excludedFromBudget: false,
            location: nil,
            merchant: nil,
            attachmentIds: nil
        )
    }

    // MARK: - Validation (server mirror)

    func testValidationRejectsUnbalancedEntry() async throws {
        let database = try makeDatabase()
        let ledgerId = try await makeLedger(database: database)
        let write = LocalJournalWriteRepository(database: database)
        let accounts = try await accounts(ledgerId: ledgerId, database: database)
        let food = try XCTUnwrap(accounts.first { $0.code == "food" })
        let pocket = try XCTUnwrap(accounts.first { $0.code == "defaultAccount" })
        // 100 out, 90 back — the server's balance check.
        var unbalanced = draft(debitAccount: food.id, creditAccount: pocket.id, amount: 100)
        unbalanced.lines = [
            (food.id, 100, 0, nil),
            (pocket.id, 0, 90, nil),
        ]
        do {
            _ = try await write.createEntry(ledgerId: ledgerId, creatorId: "me", draft: unbalanced)
            XCTFail("unbalanced entry must throw")
        } catch let error as LocalValidationError {
            XCTAssertTrue(error.message.contains("balanced"))
        }
    }

    func testValidationRejectsForeignParticipantAndPayer() async throws {
        let database = try makeDatabase()
        let ledgerId = try await makeLedger(database: database)
        let write = LocalJournalWriteRepository(database: database)
        let accounts = try await accounts(ledgerId: ledgerId, database: database)
        let food = try XCTUnwrap(accounts.first { $0.code == "food" })
        let pocket = try XCTUnwrap(accounts.first { $0.code == "defaultAccount" })

        var foreign = draft(debitAccount: food.id, creditAccount: pocket.id, amount: 10)
        foreign.participantUserIds = ["me", "someone-else"]
        do {
            _ = try await write.createEntry(ledgerId: ledgerId, creatorId: "me", draft: foreign)
            XCTFail("foreign participant must throw")
        } catch let error as LocalValidationError {
            XCTAssertTrue(error.message.contains("members of this ledger"))
        }

        var foreignPayer = draft(debitAccount: food.id, creditAccount: pocket.id, amount: 10)
        foreignPayer.paidByUserId = "someone-else"
        do {
            _ = try await write.createEntry(ledgerId: ledgerId, creatorId: "me", draft: foreignPayer)
            XCTFail("foreign payer must throw")
        } catch let error as LocalValidationError {
            XCTAssertTrue(error.message.contains("payer"))
        }
    }

    func testValidationMemoLimitMirrorsSchema() async throws {
        let database = try makeDatabase()
        let ledgerId = try await makeLedger(database: database)
        let write = LocalJournalWriteRepository(database: database)
        let accounts = try await accounts(ledgerId: ledgerId, database: database)
        let food = try XCTUnwrap(accounts.first { $0.code == "food" })
        let pocket = try XCTUnwrap(accounts.first { $0.code == "defaultAccount" })
        let longMemo = String(repeating: "记", count: 501)
        do {
            _ = try await write.createEntry(
                ledgerId: ledgerId, creatorId: "me",
                draft: draft(debitAccount: food.id, creditAccount: pocket.id, amount: 10, memo: longMemo)
            )
            XCTFail("501-char memo must throw")
        } catch let error as LocalValidationError {
            XCTAssertTrue(error.message.contains("500"))
        }
    }

    func testValidationArchivedLedgerIsAWriteFloor() async throws {
        let database = try makeDatabase()
        let ledgerId = try await makeLedger(database: database)
        let ledgerRepository = LocalLedgerRepository(database: database)
        try await ledgerRepository.setStatus(ledgerId, status: "archived")
        let write = LocalJournalWriteRepository(database: database)
        let accounts = try await accounts(ledgerId: ledgerId, database: database)
        let food = try XCTUnwrap(accounts.first { $0.code == "food" })
        let pocket = try XCTUnwrap(accounts.first { $0.code == "defaultAccount" })
        do {
            _ = try await write.createEntry(
                ledgerId: ledgerId, creatorId: "me",
                draft: draft(debitAccount: food.id, creditAccount: pocket.id, amount: 10)
            )
            XCTFail("archived ledger must refuse writes")
        } catch let error as LocalValidationError {
            XCTAssertTrue(error.message.contains("archived"))
        }
    }

    // MARK: - Entry lifecycle

    func testEntryNoStaysMonotonicAfterDeletingTheHighest() async throws {
        let database = try makeDatabase()
        let ledgerId = try await makeLedger(database: database)
        let write = LocalJournalWriteRepository(database: database)
        let accounts = try await accounts(ledgerId: ledgerId, database: database)
        let food = try XCTUnwrap(accounts.first { $0.code == "food" })
        let pocket = try XCTUnwrap(accounts.first { $0.code == "defaultAccount" })

        let first = try await write.createEntry(
            ledgerId: ledgerId, creatorId: "me",
            draft: draft(debitAccount: food.id, creditAccount: pocket.id, amount: 10)
        )
        let second = try await write.createEntry(
            ledgerId: ledgerId, creatorId: "me",
            draft: draft(debitAccount: food.id, creditAccount: pocket.id, amount: 20)
        )
        XCTAssertEqual(first.entryNo, 1)
        XCTAssertEqual(second.entryNo, 2)
        // Delete the HIGHEST; the next post must still be 3 (never reused).
        try await write.deleteEntry(ledgerId: ledgerId, entryId: second.id)
        let third = try await write.createEntry(
            ledgerId: ledgerId, creatorId: "me",
            draft: draft(debitAccount: food.id, creditAccount: pocket.id, amount: 30)
        )
        XCTAssertEqual(third.entryNo, 3, "entryNo is the ledger counter, not MAX(rows)+1")

        // Update keeps entryNo and the creator.
        var edited = draft(debitAccount: food.id, creditAccount: pocket.id, amount: 30)
        edited.memo = "改过"
        let updated = try await write.updateEntry(
            ledgerId: ledgerId, entryId: third.id, editorId: "me", draft: edited
        )
        XCTAssertEqual(updated.entryNo, 3)
        XCTAssertEqual(updated.createdById, "me")
        XCTAssertEqual(updated.memo, "改过")
        XCTAssertEqual(updated.lines.first?.debit, 30)
    }

    func testOfflineWriteSurvivesReopenAndFeedsReads() async throws {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("local-write-reopen-\(UUID().uuidString).sqlite3")
        let database = try LocalDatabase(fileURL: url)
        let ledgerId = try await makeLedger(database: database)
        let write = LocalJournalWriteRepository(database: database)
        let accounts = try await accounts(ledgerId: ledgerId, database: database)
        let meals = try XCTUnwrap(accounts.first { $0.code == "meals" })
        let pocket = try XCTUnwrap(accounts.first { $0.code == "defaultAccount" })
        _ = try await write.createEntry(
            ledgerId: ledgerId, creatorId: "me",
            draft: draft(debitAccount: meals.id, creditAccount: pocket.id, amount: 42, memo: "午餐")
        )
        // Reopen (the cold-restart path of AC2.3) and read.
        let reopened = try LocalDatabase(fileURL: url)
        let journal = LocalJournalRepository(database: reopened)
        let filter = LocalJournalFilter(q: "午餐")
        let result = try await journal.entries(
            ledgerId: ledgerId, filter: filter, sort: .dateNewestFirst, limit: 10, offset: 0
        )
        XCTAssertEqual(result.total, 1, "LIKE search finds the Chinese memo (AC2.4)")
        let entry = try XCTUnwrap(result.entries.first)
        XCTAssertEqual(entry.valueCents, 4_200)
        XCTAssertEqual(entry.paidById, "me", "paidBy defaults to the creator like the server")
        try? FileManager.default.removeItem(at: url)
    }

    // MARK: - Balance adjustment

    func testSetBalancePostsBalancedAdjustmentAgainstOffset() async throws {
        let database = try makeDatabase()
        let ledgerId = try await makeLedger(database: database)
        let write = LocalJournalWriteRepository(database: database)
        let reportRepository = LocalReportRepository(database: database)
        let accounts = try await accounts(ledgerId: ledgerId, database: database)
        let pocket = try XCTUnwrap(accounts.first { $0.code == "defaultAccount" })

        // Balance 0 → set to 100: delta +100 on an asset = debit target.
        let first = try await write.setBalance(
            ledgerId: ledgerId, accountId: pocket.id,
            balance: 100, date: Date(), memo: "期初", actorId: "me"
        )
        XCTAssertEqual(first.adjusted, true)
        let adjustment = try XCTUnwrap(first.entry)
        XCTAssertEqual(adjustment.valueCents, 0, "asset↔equity nets to zero behavioral value")
        let totals = adjustment.lines.reduce(0) { $0 + Int((($1.debit - $1.credit) * 100).rounded()) }
        XCTAssertEqual(totals, 0, "the adjustment entry is balanced")
        XCTAssertEqual(adjustment.lines.count, 2)
        XCTAssertEqual(adjustment.paidById, "me")

        // As-of sums confirm the pocket now reads 100.
        let trial = try await reportRepository.trialBalance(ledgerId: ledgerId, from: nil, to: nil)
        let pocketRow = try XCTUnwrap(trial.accounts.first { $0.id == pocket.id })
        XCTAssertEqual(pocketRow.balance, 100.0)

        // Setting the SAME balance is a no-op (adjusted: false, no entry).
        let second = try await write.setBalance(
            ledgerId: ledgerId, accountId: pocket.id,
            balance: 100, date: Date(), memo: nil, actorId: "me"
        )
        XCTAssertEqual(second.adjusted, false)
        XCTAssertNil(second.entry)
    }

    // MARK: - Budget settings writes

    func testMonthOverrideRequiresTheYearRow() async throws {
        let database = try makeDatabase()
        let ledgerId = try await makeLedger(database: database)
        let write = LocalSettingsWriteRepository(database: database)
        do {
            try await write.setMonthBudget(ledgerId: ledgerId, year: 2026, month: 3, cents: 10_000)
            XCTFail("override without a year row must throw (the server's guard)")
        } catch let error as LocalValidationError {
            XCTAssertTrue(error.message.contains("year"))
        }
        try await write.setYearBudget(ledgerId: ledgerId, year: 2026, cents: 60_000)
        try await write.setMonthBudget(ledgerId: ledgerId, year: 2026, month: 3, cents: 40_000)
        let reportRepository = LocalReportRepository(database: database)
        let settings = try await reportRepository.budgetSettings(ledgerId: ledgerId, year: 2026)
        XCTAssertEqual(settings.cents, 60_000)
        XCTAssertEqual(settings.months, [BudgetMonthOverride(month: 3, cents: 40_000)])
        // Closing the year wipes the pin with it (the cascade).
        try await write.closeYearBudget(ledgerId: ledgerId, year: 2026)
        let cleared = try await reportRepository.budgetSettings(ledgerId: ledgerId, year: 2026)
        XCTAssertNil(cleared.cents)
        XCTAssertTrue(cleared.months.isEmpty)
    }

    func testExcludedCategoriesMustBeExpensesOfThisLedger() async throws {
        let database = try makeDatabase()
        let ledgerId = try await makeLedger(database: database)
        let write = LocalSettingsWriteRepository(database: database)
        let accounts = try await accounts(ledgerId: ledgerId, database: database)
        let food = try XCTUnwrap(accounts.first { $0.code == "food" })
        let salary = try XCTUnwrap(accounts.first { $0.code == "salary" })
        do {
            try await write.setExcludedCategories(ledgerId: ledgerId, accountIds: [salary.id])
            XCTFail("income exclusion must throw")
        } catch let error as LocalValidationError {
            XCTAssertTrue(error.message.contains("expense"))
        }
        try await write.setExcludedCategories(ledgerId: ledgerId, accountIds: [food.id, food.id])
        let reportRepository = LocalReportRepository(database: database)
        let settings = try await reportRepository.budgetSettings(ledgerId: ledgerId, year: 2026)
        XCTAssertEqual(settings.excludedAccountIds, [food.id], "deduped like the server")
    }

    func testCategoryBudgetUpsertAndDelete() async throws {
        let database = try makeDatabase()
        let ledgerId = try await makeLedger(database: database)
        let write = LocalSettingsWriteRepository(database: database)
        let reportRepository = LocalReportRepository(database: database)
        let accounts = try await accounts(ledgerId: ledgerId, database: database)
        let food = try XCTUnwrap(accounts.first { $0.code == "food" })
        try await write.upsertCategoryBudget(ledgerId: ledgerId, year: 2026, accountId: food.id, cents: 120_000)
        var settings = try await reportRepository.categoryBudgetSettings(ledgerId: ledgerId, year: 2026)
        XCTAssertEqual(settings.categories.map(\.cents), [120_000])
        XCTAssertEqual(settings.carryOver, [], "previous year has no rows")
        // Re-pin (upsert, not a second row).
        try await write.upsertCategoryBudget(ledgerId: ledgerId, year: 2026, accountId: food.id, cents: 90_000)
        settings = try await reportRepository.categoryBudgetSettings(ledgerId: ledgerId, year: 2026)
        XCTAssertEqual(settings.categories.count, 1)
        XCTAssertEqual(settings.categories.first?.cents, 90_000)
        // Next year's prefill reads this year as carry-over.
        try await write.upsertCategoryBudget(ledgerId: ledgerId, year: 2027, accountId: food.id, cents: 95_000)
        let nextYear = try await reportRepository.categoryBudgetSettings(ledgerId: ledgerId, year: 2027)
        XCTAssertEqual(nextYear.carryOver.first?.cents, 90_000)
        try await write.deleteCategoryBudget(ledgerId: ledgerId, year: 2026, accountId: food.id)
        let afterDelete = try await reportRepository.categoryBudgetSettings(ledgerId: ledgerId, year: 2026)
        XCTAssertTrue(afterDelete.categories.isEmpty)
    }

    // MARK: - Account guards

    func testAccountDeleteGuardsMirrorTheServer() async throws {
        let database = try makeDatabase()
        let ledgerId = try await makeLedger(database: database)
        let write = LocalSettingsWriteRepository(database: database)
        let journalWrite = LocalJournalWriteRepository(database: database)
        let accounts = try await accounts(ledgerId: ledgerId, database: database)
        let defaultPocket = try XCTUnwrap(accounts.first { $0.code == "defaultAccount" })
        let salary = try XCTUnwrap(accounts.first { $0.code == "salary" })

        // Builtin block.
        do {
            try await write.deleteAccount(ledgerId: ledgerId, accountId: defaultPocket.id)
            XCTFail("builtin delete must throw")
        } catch let error as LocalValidationError {
            XCTAssertTrue(error.message.contains("Built-in"))
        }
        // Line guard: a seeded non-builtin income account with no lines
        // deletes cleanly (the same rule the server applies).
        try await write.deleteAccount(ledgerId: ledgerId, accountId: salary.id)
        // Create one, post against it, then refuse the delete.
        let created = try await write.createAccount(
            ledgerId: ledgerId, name: "咖啡", type: .expense,
            parentId: nil, icon: "☕️", meta: nil, realAccountId: nil
        )
        let pocket = defaultPocket
        _ = try await journalWrite.createEntry(
            ledgerId: ledgerId, creatorId: "me",
            draft: draft(debitAccount: created.id, creditAccount: pocket.id, amount: 5)
        )
        do {
            try await write.deleteAccount(ledgerId: ledgerId, accountId: created.id)
            XCTFail("delete with lines must throw")
        } catch let error as LocalValidationError {
            XCTAssertTrue(error.message.contains("archive it instead"))
        }
        // Archive then un-archive (the preferred path).
        try await write.setAccountStatus(ledgerId: ledgerId, accountId: created.id, status: "archived")
        let chart = try await self.accounts(ledgerId: ledgerId, database: database)
        XCTAssertEqual(chart.first { $0.id == created.id }?.status, "archived")
    }

    func testReorderRejectsParentMoves() async throws {
        let database = try makeDatabase()
        let ledgerId = try await makeLedger(database: database)
        let write = LocalSettingsWriteRepository(database: database)
        let accounts = try await accounts(ledgerId: ledgerId, database: database)
        let food = try XCTUnwrap(accounts.first { $0.code == "food" })
        let meals = try XCTUnwrap(accounts.first { $0.code == "meals" })
        let salary = try XCTUnwrap(accounts.first { $0.code == "salary" })
        // Same parent (nil) reorder is fine.
        try await write.reorderAccounts(ledgerId: ledgerId, items: [
            (salary.id, nil, 70),
            (food.id, nil, 71),
        ])
        // Moving meals to a DIFFERENT parent (root) via reorder is refused
        // (the server rule — reorder never re-parents).
        do {
            try await write.reorderAccounts(ledgerId: ledgerId, items: [
                (meals.id, nil, 0),
            ])
            XCTFail("cross-parent reorder must throw")
        } catch let error as LocalValidationError {
            XCTAssertTrue(error.message.contains("different parent"))
        }
    }

    // MARK: - Attachments (stage → claim → prune)

    func testAttachmentStageClaimPruneRoundtrip() async throws {
        let database = try makeDatabase()
        let ledgerId = try await makeLedger(database: database)
        let write = LocalJournalWriteRepository(database: database)
        let store = LocalAttachmentStore(database: database)
        let accounts = try await accounts(ledgerId: ledgerId, database: database)
        let food = try XCTUnwrap(accounts.first { $0.code == "food" })
        let pocket = try XCTUnwrap(accounts.first { $0.code == "defaultAccount" })

        // Stage two receipts (the upload-before-save flow).
        let refA = try await store.stage(data: Data("receipt-A".utf8), mimeType: "image/jpeg")
        let refB = try await store.stage(data: Data("receipt-B".utf8), mimeType: "image/png")
        var receiptDraft = draft(debitAccount: food.id, creditAccount: pocket.id, amount: 12)
        receiptDraft.attachmentIds = [refA.id, refB.id]
        let created = try await write.createEntry(ledgerId: ledgerId, creatorId: "me", draft: receiptDraft)
        XCTAssertEqual(created.attachments?.count, 2, "claimed refs ride the entry payload")

        // Bytes are readable back.
        XCTAssertEqual(store.data(for: refA), Data("receipt-A".utf8))

        // Update to keep only refB: refA's row + file go.
        var edit = self.draft(debitAccount: food.id, creditAccount: pocket.id, amount: 12)
        edit.attachmentIds = [refB.id]
        _ = try await write.updateEntry(
            ledgerId: ledgerId, entryId: created.id, editorId: "me", draft: edit
        )
        let kept = try await store.attachments(entryId: created.id)
        XCTAssertEqual(kept.map(\.id), [refB.id])
        XCTAssertNil(store.data(for: refA), "the pruned receipt's file is gone")
        XCTAssertEqual(store.data(for: refB), Data("receipt-B".utf8))

        // Deleting the entry wipes the remaining receipt's file too.
        try await write.deleteEntry(ledgerId: ledgerId, entryId: created.id)
        XCTAssertNil(store.data(for: refB))
    }

    // MARK: - Projects & real accounts

    func testProjectLifecycleLocal() async throws {
        let database = try makeDatabase()
        let ledgerId = try await makeLedger(database: database)
        let write = LocalSettingsWriteRepository(database: database)
        let reportRepository = LocalReportRepository(database: database)
        let projectId = try await write.createProject(
            ledgerId: ledgerId, creatorId: "me", name: "旅行",
            description: nil, startDate: nil, endDate: nil
        )
        var projects = try await reportRepository.projects(ledgerId: ledgerId)
        XCTAssertEqual(projects.count, 1)
        XCTAssertEqual(projects[0].members.map(\.userId), ["me"], "the creator joins as the first member")
        try await write.updateProject(
            ledgerId: ledgerId, projectId: projectId, name: nil, description: nil,
            status: "archived", startDate: nil, endDate: nil
        )
        projects = try await reportRepository.projects(ledgerId: ledgerId)
        XCTAssertEqual(projects[0].status, "archived")
        try await write.deleteProject(ledgerId: ledgerId, projectId: projectId)
        projects = try await reportRepository.projects(ledgerId: ledgerId)
        XCTAssertTrue(projects.isEmpty)
    }

    func testRealAccountLifecycleLocal() async throws {
        let database = try makeDatabase()
        let ledgerId = try await makeLedger(database: database)
        let write = LocalSettingsWriteRepository(database: database)
        let reportRepository = LocalReportRepository(database: database)
        let realId = try await write.createRealAccount(
            ownerId: "me", name: "工资卡", type: .asset, icon: "💳", meta: nil
        )
        let (realAccounts, totals) = try await reportRepository.realAccounts(ownerId: "me", ledgerId: ledgerId)
        XCTAssertEqual(realAccounts.count, 1)
        XCTAssertEqual(realAccounts[0].name, "工资卡")
        XCTAssertEqual(totals.assets, 0.0)
        try await write.updateRealAccount(id: realId, name: "主卡", status: nil, icon: nil, meta: nil)
        let renamed = try await reportRepository.realAccounts(ownerId: "me", ledgerId: ledgerId)
        XCTAssertEqual(renamed.accounts[0].name, "主卡")
        try await write.deleteRealAccount(id: realId)
        let empty = try await reportRepository.realAccounts(ownerId: "me", ledgerId: ledgerId)
        XCTAssertTrue(empty.accounts.isEmpty)
    }
}
