//
//  RecentCategoryDefaultTests.swift
//  QianlaiTests
//

import XCTest
@testable import Qianlai

/// The quick-entry default's derivation chain: the first recent id still
/// a leaf of the built tree, else the tree's first leaf, else nothing —
/// the contract `QuickEntryView.defaultCategoryId` builds on (ISSUE-114).
/// The journal deliberately takes no part: it is not an input here, which
/// is what pins AC1's "recents first wins even against the latest entry"
/// and AC5's "empty recents falls straight to the first leaf".
final class RecentCategoryDefaultTests: XCTestCase {
    /// AC1: the recents row's first entry wins — even though the latest
    /// journal entry (not an input here) might name a different category.
    func testFirstRecentWins() {
        let tree = makeTree([
            makeAccount(id: "meal", name: "餐饮"),
            makeAccount(id: "transport", name: "交通"),
        ])
        XCTAssertEqual(
            RecentCategoryDefault.categoryId(recentIds: ["meal", "transport"], tree: tree),
            "meal"
        )
    }

    /// AC2: a recent id whose category was since deleted is not in the
    /// tree and is skipped for the first still-valid entry.
    func testDeletedRecentSkipped() {
        let tree = makeTree([
            makeAccount(id: "meal", name: "餐饮"),
            makeAccount(id: "transport", name: "交通"),
        ])
        XCTAssertEqual(
            RecentCategoryDefault.categoryId(recentIds: ["gone", "meal"], tree: tree),
            "meal"
        )
    }

    /// AC3: archived drops out of the tree at build time (the production
    /// pool excludes it), so an archived recent is skipped the same way
    /// as a deleted one.
    func testArchivedRecentSkipped() {
        var archived = makeAccount(id: "archived", name: "已归档")
        archived.status = "archived"
        let tree = makeTree([archived, makeAccount(id: "meal", name: "餐饮")])
        XCTAssertTrue(tree.allSatisfy { $0.account.id != "archived" })
        XCTAssertEqual(
            RecentCategoryDefault.categoryId(recentIds: ["archived", "meal"], tree: tree),
            "meal"
        )
    }

    /// AC4: a posted leaf that has since grown subs is a parent now —
    /// the grid can't pick it, so the default skips it too.
    func testRecentGrownIntoParentSkipped() {
        let tree = makeTree([
            makeAccount(id: "food", name: "食品"),
            makeAccount(id: "meal", name: "餐饮", parentId: "food"),
            makeAccount(id: "transport", name: "交通"),
        ])
        XCTAssertEqual(
            RecentCategoryDefault.categoryId(recentIds: ["food", "meal"], tree: tree),
            "meal"
        )
    }

    /// AC5: empty recents falls straight to the tree's first leaf in
    /// picker order — no journal scan in between (the journal is not an
    /// input, so no entry could change this outcome).
    func testEmptyRecentsFallToFirstLeaf() {
        let tree = makeTree([
            makeAccount(id: "food", name: "食品"),
            makeAccount(id: "meal", name: "餐饮", parentId: "food"),
            makeAccount(id: "transport", name: "交通"),
        ])
        XCTAssertEqual(
            RecentCategoryDefault.categoryId(recentIds: [], tree: tree),
            "meal"
        )
    }

    /// AC6: every recent gone stale still lands on the tree's first leaf.
    func testAllStaleRecentsFallToFirstLeaf() {
        let tree = makeTree([
            makeAccount(id: "food", name: "食品"),
            makeAccount(id: "meal", name: "餐饮", parentId: "food"),
        ])
        XCTAssertEqual(
            RecentCategoryDefault.categoryId(recentIds: ["gone", "archived", "food"], tree: tree),
            "meal"
        )
    }

    /// AC7: no tree, no prefill — with or without recents.
    func testEmptyTreeYieldsNil() {
        XCTAssertNil(RecentCategoryDefault.categoryId(recentIds: [], tree: []))
        XCTAssertNil(RecentCategoryDefault.categoryId(recentIds: ["meal"], tree: []))
    }

    /// AC8's derivation half: ids from another kind's bucket don't leak —
    /// an income-only recent id can't resolve against the expense tree,
    /// so the default stays inside the current kind's own categories.
    func testForeignKindIdDoesNotResolve() {
        let expenseTree = makeTree([
            makeAccount(id: "meal", name: "餐饮"),
            makeAccount(id: "transport", name: "交通"),
        ])
        XCTAssertEqual(
            RecentCategoryDefault.categoryId(recentIds: ["redPacket"], tree: expenseTree),
            "meal"
        )
    }

    // MARK: - Helpers

    private func makeTree(_ accounts: [BookAccount]) -> [AccountTreeEntry] {
        AccountTreeEntry.build(accounts)
    }

    private func makeAccount(
        id: String,
        name: String?,
        parentId: String? = nil
    ) -> BookAccount {
        BookAccount(
            id: id,
            ledgerId: "l1",
            name: name,
            code: nil,
            type: .expense,
            sortOrder: 0,
            parentId: parentId,
            status: "active",
            icon: nil,
            flags: [],
            meta: nil,
            createdAt: Date(timeIntervalSince1970: 0)
        )
    }
}
