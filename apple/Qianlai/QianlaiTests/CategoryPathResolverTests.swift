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

    /// Seeded i18n accounts have no server-side name — their prompt paths
    /// are the permanent codes, and the resolver walks them against `code`.
    func testSeededCodePathResolves() {
        let tree = AccountTreeEntry.build([
            makeAccount(id: "food", name: nil, code: "food"),
            makeAccount(id: "meals", name: nil, code: "meals", parentId: "food"),
            makeAccount(id: "transport", name: nil, code: "transport"),
        ])
        XCTAssertEqual(
            CategoryPathResolver.leafAccountId(forSuggestion: "food/meals", tree: tree),
            "meals"
        )
        // Codes are camelCase; transcription case can't break the walk.
        XCTAssertEqual(
            CategoryPathResolver.leafAccountId(forSuggestion: "Food/Meals", tree: tree),
            "meals"
        )
        XCTAssertEqual(
            CategoryPathResolver.leafAccountId(forSuggestion: "transport", tree: tree),
            "transport"
        )
    }

    /// A user rename sets `name` above the label but the prompt still lists
    /// the code — the renamed built-in must keep resolving by code.
    func testRenamedSeededAccountStillResolvesByCode() {
        let tree = AccountTreeEntry.build([
            makeAccount(id: "food", name: "吃货", code: "food"),
            makeAccount(id: "meals", name: "正餐", code: "meals", parentId: "food"),
        ])
        XCTAssertEqual(
            CategoryPathResolver.leafAccountId(forSuggestion: "food/meals", tree: tree),
            "meals"
        )
    }

    /// Mixed chains — user-created parent (name) over a seeded leaf (code)
    /// — walk segment by segment against either key.
    func testMixedNameAndCodeChainResolves() {
        let tree = AccountTreeEntry.build([
            makeAccount(id: "market", name: "买菜"),
            makeAccount(id: "groceries", name: nil, code: "groceries", parentId: "market"),
        ])
        XCTAssertEqual(
            CategoryPathResolver.leafAccountId(forSuggestion: "买菜/groceries", tree: tree),
            "groceries"
        )
    }

    /// The bare-key fallback accepts a unique code leaf the same way it
    /// accepts a unique name leaf.
    func testBareUniqueCodeLeafResolves() {
        let tree = AccountTreeEntry.build([
            makeAccount(id: "food", name: nil, code: "food"),
            makeAccount(id: "meals", name: nil, code: "meals", parentId: "food"),
        ])
        XCTAssertEqual(
            CategoryPathResolver.leafAccountId(forSuggestion: "meals", tree: tree),
            "meals"
        )
    }

    private func makeAccount(
        id: String,
        name: String?,
        code: String? = nil,
        parentId: String? = nil
    ) -> BookAccount {
        BookAccount(
            id: id,
            ledgerId: "l1",
            name: name,
            code: code,
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
