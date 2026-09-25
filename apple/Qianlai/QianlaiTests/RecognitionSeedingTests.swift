//
//  RecognitionSeedingTests.swift
//  QianlaiTests
//

import XCTest
@testable import Qianlai

/// The pure AI-mode quick-entry seeding: the kind mapping, the memo and
/// merchant seeds, and the suggestion list's recommended-first,
/// de-duplicated order — the contract `QuickEntryView(recognition:)` builds
/// on.
final class RecognitionSeedingTests: XCTestCase {
    /// "income" reads as income; anything else — nil, unknown strings, or
    /// "expense" — reads as expense, the recognition page's own mapping.
    func testKindMapping() {
        func recognition(withKind kind: String?) -> ScreenshotRecognition {
            makeRecognition(kind: kind)
        }
        XCTAssertEqual(RecognitionSeeding.kind(from: recognition(withKind: "income")), .income)
        XCTAssertEqual(RecognitionSeeding.kind(from: recognition(withKind: "expense")), .expense)
        XCTAssertEqual(RecognitionSeeding.kind(from: recognition(withKind: "transfer-out")), .expense)
        XCTAssertEqual(RecognitionSeeding.kind(from: recognition(withKind: nil)), .expense)
    }

    /// The memo prefill is the recognition's own memo, trimmed — the
    /// merchant no longer rides here (it seeds its own field).
    func testMemoPrefill() {
        XCTAssertEqual(
            RecognitionSeeding.memo(from: makeRecognition(merchant: "全家便利店", memo: "午餐")),
            "午餐"
        )
        XCTAssertEqual(
            RecognitionSeeding.memo(from: makeRecognition(memo: "  ")),
            ""
        )
        XCTAssertEqual(
            RecognitionSeeding.memo(from: makeRecognition(memo: nil)),
            ""
        )
    }

    /// The merchant seed trims and collapses blanks to nil — an absent
    /// merchant leaves the draft's merchant field empty.
    func testMerchantSeeding() {
        XCTAssertEqual(
            RecognitionSeeding.merchant(from: makeRecognition(merchant: " 全家便利店 ")),
            "全家便利店"
        )
        XCTAssertNil(RecognitionSeeding.merchant(from: makeRecognition(merchant: nil)))
        XCTAssertNil(RecognitionSeeding.merchant(from: makeRecognition(merchant: "  \n")))
    }

    /// The recommended path leads, alternatives follow in order, and a
    /// suggestion that repeats an earlier one is dropped.
    func testSuggestionsRecommendedFirstAndDeduplicated() {
        let tree = AccountTreeEntry.build([
            makeAccount(id: "food", name: "食品"),
            makeAccount(id: "meal", name: "餐饮", parentId: "food"),
            makeAccount(id: "transport", name: "交通"),
        ])
        let recognition = makeRecognition(
            categoryName: "食品/餐饮",
            categoryAlternatives: ["交通", "食品/餐饮"]
        )
        XCTAssertEqual(
            RecognitionSeeding.suggestedCategoryEntries(for: recognition, tree: tree)
                .map(\.account.id),
            ["meal", "transport"]
        )
    }

    /// Suggestions that don't resolve against the tree — unknown paths,
    /// parent-only paths, empty names — drop out instead of poisoning the
    /// grid; an all-miss list comes back empty.
    func testUnresolvableSuggestionsDropped() {
        let tree = AccountTreeEntry.build([
            makeAccount(id: "apparel", name: "服饰"),
            makeAccount(id: "clothes", name: "衣服", parentId: "apparel"),
        ])
        XCTAssertEqual(
            RecognitionSeeding.suggestedCategoryEntries(
                for: makeRecognition(
                    categoryName: "服饰",
                    categoryAlternatives: ["服饰/衣服", "育儿/衣服"]
                ),
                tree: tree
            ).map(\.account.id),
            ["clothes"]
        )
        XCTAssertTrue(
            RecognitionSeeding.suggestedCategoryEntries(
                for: makeRecognition(categoryName: "不存在", categoryAlternatives: nil),
                tree: tree
            ).isEmpty
        )
        XCTAssertTrue(
            RecognitionSeeding.suggestedCategoryEntries(
                for: makeRecognition(categoryName: nil, categoryAlternatives: nil),
                tree: tree
            ).isEmpty
        )
    }

    // MARK: - Helpers

    private func makeRecognition(
        kind: String? = "expense",
        merchant: String? = nil,
        memo: String? = nil,
        categoryName: String? = nil,
        categoryAlternatives: [String]? = nil
    ) -> ScreenshotRecognition {
        ScreenshotRecognition(
            recognized: true,
            kind: kind,
            amount: nil,
            amountAlternatives: nil,
            occurredAt: nil,
            merchant: merchant,
            memo: memo,
            categoryName: categoryName,
            categoryAlternatives: categoryAlternatives,
            confidence: nil
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
