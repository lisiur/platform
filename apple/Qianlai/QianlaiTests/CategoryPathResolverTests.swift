//
//  CategoryPathResolverTests.swift
//  QianlaiTests
//

import XCTest
@testable import Qianlai

/// The recognition prompt lists leaves as "/"-joined paths so same-named
/// leaves under different parents (服饰/衣服 vs 育儿/衣服) stay
/// distinguishable; the resolver must land on exactly that leaf, and only
/// ever on a leaf.
final class CategoryPathResolverTests: XCTestCase {
    /// 服饰/衣服 vs 育儿/衣服 — the whole point of paths.
    func testDuplicateLeafNamesDisambiguatedByPath() {
        let tree = AccountTreeEntry.build([
            makeAccount(id: "apparel", name: "服饰"),
            makeAccount(id: "clothes", name: "衣服", parentId: "apparel"),
            makeAccount(id: "kids", name: "育儿"),
            makeAccount(id: "kidsclothes", name: "衣服", parentId: "kids"),
        ])
        XCTAssertEqual(
            CategoryPathResolver.leafAccountId(forSuggestion: "服饰/衣服", tree: tree),
            "clothes"
        )
        XCTAssertEqual(
            CategoryPathResolver.leafAccountId(forSuggestion: "育儿/衣服", tree: tree),
            "kidsclothes"
        )
    }

    /// A bare duplicate leaf name is ambiguous on purpose — no path, no pick.
    func testBareAmbiguousLeafNameResolvesToNil() {
        let tree = AccountTreeEntry.build([
            makeAccount(id: "apparel", name: "服饰"),
            makeAccount(id: "clothes", name: "衣服", parentId: "apparel"),
            makeAccount(id: "kids", name: "育儿"),
            makeAccount(id: "kidsclothes", name: "衣服", parentId: "kids"),
        ])
        XCTAssertNil(CategoryPathResolver.leafAccountId(forSuggestion: "衣服", tree: tree))
    }

    /// Top-level leaves and deeper paths both resolve; matching is
    /// case-insensitive and tolerates stray whitespace.
    func testTopLevelLeafAndWhitespace() {
        let tree = AccountTreeEntry.build([
            makeAccount(id: "food", name: "食品"),
            makeAccount(id: "meal", name: "餐饮", parentId: "food"),
            makeAccount(id: "transport", name: "交通"),
        ])
        XCTAssertEqual(
            CategoryPathResolver.leafAccountId(forSuggestion: "交通", tree: tree),
            "transport"
        )
        XCTAssertEqual(
            CategoryPathResolver.leafAccountId(forSuggestion: "食品/餐饮", tree: tree),
            "meal"
        )
        XCTAssertEqual(
            CategoryPathResolver.leafAccountId(forSuggestion: "食品/餐饮", tree: tree),
            "meal"
        )
    }

    /// A path whose last segment names a parent does not resolve — the
    /// selectable range is leaves only.
    func testParentAloneNeverResolves() {
        let tree = AccountTreeEntry.build([
            makeAccount(id: "apparel", name: "服饰"),
            makeAccount(id: "clothes", name: "衣服", parentId: "apparel"),
        ])
        XCTAssertNil(CategoryPathResolver.leafAccountId(forSuggestion: "服饰", tree: tree))
        XCTAssertNil(CategoryPathResolver.leafAccountId(forSuggestion: "服饰/衣服/更多", tree: tree))
    }

    /// Broken paths (unknown segment) and empty suggestions resolve to nil.
    func testBrokenPathsResolvesToNil() {
        let tree = AccountTreeEntry.build([
            makeAccount(id: "apparel", name: "服饰"),
            makeAccount(id: "clothes", name: "衣服", parentId: "apparel"),
        ])
        XCTAssertNil(CategoryPathResolver.leafAccountId(forSuggestion: "育儿/衣服", tree: tree))
        XCTAssertNil(CategoryPathResolver.leafAccountId(forSuggestion: "服饰/不存在", tree: tree))
        XCTAssertNil(CategoryPathResolver.leafAccountId(forSuggestion: "///", tree: tree))
        XCTAssertNil(CategoryPathResolver.leafAccountId(forSuggestion: "   ", tree: tree))
    }

    /// Three-level trees walk the whole chain.
    func testThreeLevelPath() {
        let tree = AccountTreeEntry.build([
            makeAccount(id: "food", name: "食品"),
            makeAccount(id: "groceries", name: "买菜", parentId: "food"),
            makeAccount(id: "snacks", name: "零食", parentId: "groceries"),
        ])
        XCTAssertEqual(
            CategoryPathResolver.leafAccountId(forSuggestion: "食品/买菜/零食", tree: tree),
            "snacks"
        )
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
