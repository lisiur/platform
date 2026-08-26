//
//  QianlaiModelsTests.swift
//  QianlaiTests
//
//  Created by Lisiur Day on 2026/8/26.
//

import XCTest
@testable import Qianlai

@MainActor
final class QianlaiModelsTests: XCTestCase {
    // MARK: - Roles

    func testRoleRanking() {
        XCTAssertTrue(LedgerRole.owner.atLeast(.owner))
        XCTAssertTrue(LedgerRole.owner.atLeast(.editor))
        XCTAssertTrue(LedgerRole.editor.atLeast(.editor))
        XCTAssertFalse(LedgerRole.editor.atLeast(.owner))
        XCTAssertFalse(LedgerRole.viewer.atLeast(.editor))
        XCTAssertTrue(LedgerRole.viewer.atLeast(.viewer))
    }

    func testLedgerPermissions() {
        var ledger = makeLedger(role: .editor, status: "active")
        XCTAssertTrue(ledger.canPost)
        ledger.status = "archived"
        XCTAssertFalse(ledger.canPost)
        ledger.status = "active"
        ledger.myRole = .viewer
        XCTAssertFalse(ledger.canPost)
    }

    // MARK: - Account tree & flags

    func testDefaultPocketDetection() {
        let plain = makeAccount(id: "1", flags: [])
        let debit = makeAccount(id: "2", flags: ["defaultDebit"])
        let credit = makeAccount(id: "3", flags: ["defaultCredit"])
        XCTAssertFalse(plain.isDefaultPocket)
        XCTAssertTrue(debit.isDefaultPocket)
        XCTAssertTrue(credit.isDefaultPocket)
        XCTAssertTrue(makeAccount(id: "4", flags: ["builtin"]).isBuiltin)
    }

    func testTreeBuildsParentFirstWithDepth() {
        let root = makeAccount(id: "root", sortOrder: 0)
        let child = makeAccount(id: "child", sortOrder: 1, parentId: "root")
        let grandChild = makeAccount(id: "grand", sortOrder: 2, parentId: "child")
        let otherRoot = makeAccount(id: "other", sortOrder: 3)
        let orphan = makeAccount(id: "orphan", sortOrder: 4, parentId: "missing")

        let entries = AccountTreeEntry.build([root, child, grandChild, otherRoot, orphan])
        XCTAssertEqual(entries.map(\.account.id), ["root", "child", "grand", "other", "orphan"])
        XCTAssertEqual(entries[0].depth, 0)
        XCTAssertEqual(entries[1].depth, 1)
        XCTAssertEqual(entries[2].depth, 2)
        XCTAssertEqual(entries[3].depth, 0)
        XCTAssertEqual(entries[4].depth, 0)
    }

    func testTreeHidesArchivedByDefault() {
        let a = makeAccount(id: "a", sortOrder: 0)
        let b = makeAccount(id: "b", sortOrder: 1, status: "archived")
        XCTAssertEqual(AccountTreeEntry.build([a, b]).map(\.account.id), ["a"])
        XCTAssertEqual(
            AccountTreeEntry.build([a, b], includeArchived: true).map(\.account.id),
            ["a", "b"]
        )
    }

    func testAccountDisplayNamePrefersOverrideThenCode() {
        XCTAssertEqual(makeAccount(id: "1", name: "Custom").displayName, "Custom")
        XCTAssertEqual(makeAccount(id: "1", code: "cash").displayName, "cash")
        XCTAssertEqual(makeAccount(id: "1").displayName, "—")
    }

    // MARK: - Quick entry expansion

    func testQuickEntryRequiresKindSpecificSides() {
        var draft = QuickEntryDraft()
        draft.kind = .expense
        draft.amount = 10
        draft.debitAccountId = "expense-cat"
        XCTAssertTrue(draft.isValid)

        // expense without category (debit) is invalid
        draft.debitAccountId = nil
        draft.creditAccountId = "wallet"
        XCTAssertFalse(draft.isValid)

        draft.kind = .income
        draft.creditAccountId = "salary"
        XCTAssertTrue(draft.isValid)

        draft.kind = .transfer
        draft.debitAccountId = "a"
        draft.creditAccountId = "a"
        XCTAssertFalse(draft.isValid)
        XCTAssertTrue(draft.isSameAccount)

        draft.creditAccountId = "b"
        XCTAssertTrue(draft.isValid)
    }

    func testQuickEntryBuildsBalancedLines() {
        var draft = QuickEntryDraft()
        draft.kind = .expense
        draft.amount = 42.5
        draft.debitAccountId = "food"
        draft.creditAccountId = nil
        draft.memo = "  lunch  "
        draft.participants = ["m2", "m1"]

        let body = draft.body
        XCTAssertEqual(body.lines.count, 2)
        XCTAssertEqual(body.lines[0].accountId, "food")
        XCTAssertEqual(body.lines[0].debit, 42.5)
        XCTAssertEqual(body.lines[0].credit, 0)
        XCTAssertNil(body.lines[1].accountId)
        XCTAssertEqual(body.lines[1].credit, 42.5)
        XCTAssertEqual(body.memo, "lunch")
        XCTAssertEqual(body.participantMemberIds, ["m1", "m2"])
    }

    func testQuickEntryOmitsEmptyMemoAndParticipants() {
        var draft = QuickEntryDraft()
        draft.kind = .income
        draft.amount = 1
        draft.creditAccountId = "salary"
        let body = draft.body
        XCTAssertNil(body.memo)
        XCTAssertNil(body.participantMemberIds)
    }

    // MARK: - JSONValue

    func testJsonValueRoundTrip() throws {
        let original: [String: JSONValue] = [
            "cardNo": .string("6222 *** 1234"),
            "count": .number(3),
            "flag": .bool(true),
            "nested": .object(["a": .array([.string("x"), .number(1)])]),
        ]
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode([String: JSONValue].self, from: data)
        XCTAssertEqual(decoded, original)
    }

    func testJsonValueEditableString() {
        XCTAssertEqual(JSONValue.string("abc").editableString, "abc")
        XCTAssertEqual(JSONValue.number(3).editableString, "3")
        XCTAssertEqual(JSONValue.number(3.5).editableString, "3.5")
        XCTAssertEqual(JSONValue.bool(true).editableString, "true")
        XCTAssertEqual(JSONValue.null.editableString, "")
    }

    // MARK: - Manual encodable bodies

    func testUpdateAccountBodyEncodesLinkSemantics() throws {
        // Untouched link (not sent) — key omitted.
        let untouched = UpdateAccountBody(
            name: "Wallet", icon: nil, meta: nil, status: nil,
            realAccountId: nil, linkRealAccount: false
        )
        let json = try String(data: JSONEncoder().encode(untouched), encoding: .utf8)!
        XCTAssertFalse(json.contains("realAccountId"))

        // Explicit unlink — key present with null.
        let unlink = UpdateAccountBody(
            name: nil, icon: nil, meta: nil, status: nil,
            realAccountId: nil, linkRealAccount: true
        )
        let unlinkJSON = try JSONEncoder().encode(unlink)
        let unlinkObject = try JSONSerialization.jsonObject(with: unlinkJSON) as! [String: Any]
        XCTAssertTrue(unlinkObject["realAccountId"] is NSNull)
    }

    func testUpdateLedgerBodyEncodesDescriptionClear() throws {
        let clear = UpdateLedgerBody(
            name: nil, description: nil, clearDescription: true,
            currency: nil, status: "archived"
        )
        let object = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(clear)
        ) as! [String: Any]
        XCTAssertTrue(object["description"] is NSNull)
        XCTAssertEqual(object["status"] as? String, "archived")

        let keep = UpdateLedgerBody(
            name: "New", description: nil, clearDescription: false,
            currency: nil, status: nil
        )
        let keepObject = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(keep)
        ) as! [String: Any]
        XCTAssertNil(keepObject["description"])
        XCTAssertEqual(keepObject["name"] as? String, "New")
    }

    // MARK: - Formatting & dates

    func testMoneyFormatting() {
        XCTAssertEqual(Money.format(0), "0.00")
        XCTAssertEqual(Money.format(1234.5), "1,234.50")
        XCTAssertEqual(Money.format(-42), "-42.00")
    }

    func testUTCDayStrings() {
        let date = UTCDates.date(fromUTCDayString: "2026-08-26")!
        XCTAssertEqual(UTCDates.utcDayString(date), "2026-08-26")
        let start = UTCDates.startOfUTCDay(date)
        let end = UTCDates.endOfUTCDay(date)
        XCTAssertEqual(end.timeIntervalSince(start), 86399.999, accuracy: 0.001)
    }

    func testApiQueryEncoding() {
        let query = ApiQuery.build([
            ("limit", "20"),
            ("offset", "0"),
            ("q", "groceries & snacks"),
            ("from", nil),
        ])
        XCTAssertEqual(query, "?limit=20&offset=0&q=groceries%20%26%20snacks")
        XCTAssertEqual(ApiQuery.build([("a", nil)]), "")
    }

    // MARK: - Reorder sibling logic

    func testReorderPreservesOtherTypesAndDefaultPocket() {
        // Root group: default pocket (asset), asset A, expense E1, E2.
        let items = [
            makeAccount(id: "dp", type: .asset, sortOrder: 0, flags: ["defaultDebit"]),
            makeAccount(id: "a", type: .asset, sortOrder: 1),
            makeAccount(id: "e1", type: .expense, sortOrder: 2),
            makeAccount(id: "e2", type: .expense, sortOrder: 3),
        ]
        let moved = items.first { $0.id == "e1" }!
        let group = items
            .filter { $0.parentId == moved.parentId }
            .sorted { $0.sortOrder < $1.sortOrder }
        let movable = group.filter { $0.type == moved.type && !$0.isDefaultPocket }
        var newMovable = movable
        let movedAccount = newMovable.remove(at: 0)
        newMovable.insert(movedAccount, at: 1)
        var newOrder = group
        var spliceIndex = 0
        for index in newOrder.indices {
            if newOrder[index].type == moved.type && !newOrder[index].isDefaultPocket {
                newOrder[index] = newMovable[spliceIndex]
                spliceIndex += 1
            }
        }
        // Asset block keeps its slot; default pocket stays first; expenses swap.
        XCTAssertEqual(newOrder.map(\.id), ["dp", "a", "e2", "e1"])
    }

    // MARK: - Helpers

    private func makeLedger(role: LedgerRole, status: String) -> QianlaiLedger {
        QianlaiLedger(
            id: "l1",
            ownerId: "u1",
            name: "Family",
            description: nil,
            currency: "CNY",
            status: status,
            isDefault: true,
            createdAt: Date(timeIntervalSince1970: 0),
            updatedAt: Date(timeIntervalSince1970: 0),
            myRole: role,
            membersCount: 1,
            shared: false
        )
    }

    private func makeAccount(
        id: String,
        name: String? = nil,
        code: String? = nil,
        type: AccountType = .expense,
        sortOrder: Int = 0,
        parentId: String? = nil,
        status: String = "active",
        flags: [String] = []
    ) -> BookAccount {
        BookAccount(
            id: id,
            ledgerId: "l1",
            name: name,
            code: code,
            type: type,
            sortOrder: sortOrder,
            parentId: parentId,
            status: status,
            icon: nil,
            flags: flags,
            meta: nil,
            createdAt: Date(timeIntervalSince1970: 0)
        )
    }
}
