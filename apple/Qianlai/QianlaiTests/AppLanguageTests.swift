//
//  AppLanguageTests.swift
//  QianlaiTests
//
//  Created by Lisiur Day on 2026/8/26.
//

import XCTest
@testable import Qianlai

final class AppLanguageTests: XCTestCase {
    override func setUp() {
        super.setUp()
        UserDefaults.standard.removeObject(forKey: LocaleSettings.storageKey)
    }

    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: LocaleSettings.storageKey)
        super.tearDown()
    }

    func testNoOverrideWhenFollowingSystem() {
        XCTAssertNil(AppLanguage.overrideBundle)
    }

    func testOverrideBundleResolvesChinese() {
        UserDefaults.standard.set("zh-Hans", forKey: LocaleSettings.storageKey)
        let bundle = try! XCTUnwrap(AppLanguage.overrideBundle)
        XCTAssertEqual(
            bundle.localizedString(forKey: "tab.journal", value: nil, table: nil),
            "流水"
        )
        XCTAssertEqual(
            bundle.localizedString(forKey: "realAccounts.empty", value: nil, table: nil),
            "还没有真实账户"
        )
    }

    func testUnknownIdentifierFallsBackToSystem() {
        UserDefaults.standard.set("fr", forKey: LocaleSettings.storageKey)
        XCTAssertNil(AppLanguage.overrideBundle)
    }

    func testL10nFollowsOverride() {
        UserDefaults.standard.set("zh-Hans", forKey: LocaleSettings.storageKey)
        XCTAssertEqual(L10n.string("tab.journal", defaultValue: "Journal"), "流水")
        XCTAssertEqual(
            L10n.string("api.error.requestFailed", defaultValue: "Request failed (%lld).", 42),
            "请求失败（42）。"
        )
    }

    func testL10nFallsBackToDeviceLanguageWhenFollowingSystem() {
        let expected = Bundle.main.localizedString(forKey: "tab.journal", value: "Journal", table: nil)
        XCTAssertEqual(L10n.string("tab.journal", defaultValue: "Journal"), expected)
    }
}
