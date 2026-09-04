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
        XCTAssertTrue(LedgerPolicy.atLeast(.owner, .owner))
        XCTAssertTrue(LedgerPolicy.atLeast(.owner, .editor))
        XCTAssertTrue(LedgerPolicy.atLeast(.editor, .editor))
        XCTAssertFalse(LedgerPolicy.atLeast(.editor, .owner))
        XCTAssertFalse(LedgerPolicy.atLeast(.viewer, .editor))
        XCTAssertTrue(LedgerPolicy.atLeast(.viewer, .viewer))
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
        // Seeded codes resolve through the string catalog (L10n-aware).
        XCTAssertEqual(makeAccount(id: "1", code: "cash").displayName, "Cash")
        XCTAssertEqual(makeAccount(id: "1", code: "notARealCode").displayName, "notARealCode")
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
        XCTAssertEqual(body.participantUserIds, ["m1", "m2"])
    }

    func testQuickEntryOmitsEmptyMemoAndParticipants() {
        var draft = QuickEntryDraft()
        draft.kind = .income
        draft.amount = 1
        draft.creditAccountId = "salary"
        let body = draft.body
        XCTAssertNil(body.memo)
        XCTAssertNil(body.participantUserIds)
    }

    func testQuickEntryCountsInLedgerSendsExplicitValue() throws {
        var draft = QuickEntryDraft()
        draft.kind = .expense
        draft.amount = 10
        draft.debitAccountId = "food"

        // The flag is always sent explicitly: on create `true` matches the
        // server default, and on update an explicit `true` is the only way
        // to re-include an entry that was previously opted out (omitted
        // keys keep the stored value).
        let counting = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(draft.body)
        ) as! [String: Any]
        XCTAssertEqual(counting["countsInLedger"] as! Bool, true)

        draft.countsInLedger = false
        let excluded = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(draft.body)
        ) as! [String: Any]
        XCTAssertEqual(excluded["countsInLedger"] as! Bool, false)
    }

    func testQuickEntryLocationPayloadSemantics() throws {
        var draft = QuickEntryDraft()
        draft.kind = .expense
        draft.amount = 10
        draft.debitAccountId = "food"

        // No location: the key is omitted entirely (keep-on-edit semantics
        // server-side; on create it means "no place").
        let untouched = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(draft.body)
        ) as! [String: Any]
        XCTAssertFalse(untouched.keys.contains("location"))

        // Captured place: encoded as an object with the client-resolved
        // fields.
        draft.location = EntryLocationBody(
            address: "1 Zhongguancun St",
            addressName: "Starbucks",
            latitude: 39.983425,
            longitude: 116.322083
        )
        let captured = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(draft.body)
        ) as! [String: Any]
        let capturedLocation = captured["location"] as! [String: Any]
        XCTAssertEqual(capturedLocation["addressName"] as? String, "Starbucks")
        XCTAssertEqual(capturedLocation["address"] as? String, "1 Zhongguancun St")
        XCTAssertEqual(capturedLocation["latitude"] as? Double, 39.983425)
        XCTAssertEqual(capturedLocation["longitude"] as? Double, 116.322083)

        // Cleared on an edit: an explicit null, not omission — omission
        // would keep the stored place.
        draft.location = nil
        draft.isLocationCleared = true
        let cleared = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(draft.body)
        ) as! [String: Any]
        XCTAssertTrue(cleared["location"] is NSNull)
    }

    func testEntryLocationRefDisplayNameFallbacks() {
        let named = EntryLocationRef(
            address: "1 Zhongguancun St, Beijing",
            addressName: "Starbucks",
            latitude: 39.983425,
            longitude: 116.322083
        )
        XCTAssertEqual(named.displayName, "Starbucks")

        let addressed = EntryLocationRef(
            address: "1 Zhongguancun St, Beijing",
            addressName: nil,
            latitude: nil,
            longitude: nil
        )
        XCTAssertEqual(addressed.displayName, "1 Zhongguancun St, Beijing")

        XCTAssertNil(EntryLocationRef(
            address: nil, addressName: nil, latitude: nil, longitude: nil
        ).displayName)
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

    func testMoneyCurrencyFormatting() {
        XCTAssertEqual(Money.format(1234.5, currency: "CNY"), "¥1,234.50")
        XCTAssertEqual(Money.format(9, currency: "cny"), "¥9.00")
        XCTAssertEqual(Money.format(5, currency: "HKD"), "HK$5.00")
        // The sign leads the symbol, never trails it.
        XCTAssertEqual(Money.format(-42, currency: "CNY"), "-¥42.00")
        // Unknown codes fall back to the code itself.
        XCTAssertEqual(Money.format(1, currency: "XXX"), "XXX1.00")
        // No currency renders the bare amount.
        XCTAssertEqual(Money.format(2.5, currency: nil), "2.50")
        XCTAssertEqual(Money.format(2.5, currency: ""), "2.50")
        XCTAssertEqual(Money.symbol(for: "usd"), "$")
    }

    func testLocalDayBounds() {
        let date = Date(timeIntervalSince1970: 1_000_000)
        let start = Calendar.current.startOfDay(for: date)
        let end = AppDates.localEndOfDay(date)
        XCTAssertEqual(end.timeIntervalSince(start), 86399.999, accuracy: 0.001)
        XCTAssertTrue(Calendar.current.isDate(start, inSameDayAs: date))
        XCTAssertTrue(Calendar.current.isDate(end, inSameDayAs: date))
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
