//
//  EmojiCatalogTests.swift
//  QianlaiTests
//

import XCTest
@testable import Qianlai

final class EmojiCatalogTests: XCTestCase {
    func testGroupsArePopulated() {
        XCTAssertFalse(EmojiCatalog.groups.isEmpty)
        for group in EmojiCatalog.groups {
            XCTAssertFalse(group.icons.isEmpty, group.l10nKey)
        }
    }

    func testIconsAreUniqueAcrossCatalog() {
        let all = EmojiCatalog.groups.flatMap(\.icons)
        XCTAssertEqual(all.count, Set(all).count, "duplicate emoji across groups")
    }

    func testStarterAccountIconsArePickable() {
        // The server's STARTER_ACCOUNTS icons (plus the balance-offset ⚖️)
        // must stay re-pickable, or editing a seeded category offers a
        // degraded set.
        let all = Set(EmojiCatalog.groups.flatMap(\.icons))
        let starters = [
            "👛", "🧮", "💼", "🏆", "🌙", "🪙", "🧧", "🧑‍💻", "🚀", "🧾",
            "📈", "🎉", "✨", "🍜", "🍚", "🍿", "🍎", "🥬", "👕", "🏠",
            "🚌", "🎬", "🩺", "📱", "📚", "🎊", "🍼", "🐾", "✈️", "⚖️",
        ]
        for icon in starters {
            XCTAssertTrue(all.contains(icon), "missing starter icon \(icon)")
        }
    }
}

final class EmojiSearchTests: XCTestCase {
    func testKeywordsCoverExactlyTheCatalog() {
        // Bidirectional: an icon without keywords is unsearchable; a
        // keyword entry without an icon is a typo or a removed emoji.
        let catalog = Set(EmojiCatalog.groups.flatMap(\.icons))
        XCTAssertEqual(catalog, Set(EmojiSearch.keywords.keys))
    }

    func testMatchesByKeyword() {
        XCTAssertTrue(EmojiSearch.matches("☕", query: "咖啡", groupTitle: ""))
        XCTAssertTrue(EmojiSearch.matches("☕", query: "Coffee", groupTitle: ""))
        XCTAssertTrue(EmojiSearch.matches("☕", query: " 咖啡 ", groupTitle: ""))
        XCTAssertFalse(EmojiSearch.matches("☕", query: "汽车", groupTitle: ""))
    }

    func testMatchesByGroupTitle() {
        let food = EmojiCatalog.groups.first { $0.l10nKey == "icon.group.food" }!
        XCTAssertTrue(EmojiSearch.matches("🍜", query: food.title, groupTitle: food.title))
        XCTAssertTrue(EmojiSearch.matches("🍜", query: "FOOD", groupTitle: food.title))
        XCTAssertFalse(EmojiSearch.matches("🍜", query: "宠物", groupTitle: food.title))
    }

    func testEmptyQueryMatchesEverything() {
        XCTAssertTrue(EmojiSearch.matches("☕", query: "", groupTitle: ""))
        XCTAssertTrue(EmojiSearch.matches("☕", query: "  ", groupTitle: ""))
    }
}
