//
//  PrivacySettingsTests.swift
//  QianlaiTests
//
//  Created by Lisiur Day on 2026/9/26.
//

import XCTest
@testable import Qianlai

@MainActor
final class PrivacySettingsTests: XCTestCase {
    private static let suiteName = "PrivacySettingsTests"
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        UserDefaults.standard.removePersistentDomain(forName: Self.suiteName)
        defaults = UserDefaults(suiteName: Self.suiteName)
        Self.clearKeys()
    }

    override func tearDown() {
        UserDefaults.standard.removePersistentDomain(forName: Self.suiteName)
        Self.clearKeys()
        super.tearDown()
    }

    /// The mask pair clears through the shared fixture; the app-lock flag
    /// is standard-suite only (nothing else reads it) and clears here too.
    private static func clearKeys() {
        PrivacyFixtures.clearAmountMaskKeys()
        UserDefaults.standard.removeObject(forKey: PrivacySettings.appLockKey)
    }

    func testSetHideAmountsWritesBothSuites() {
        let store = PrivacySettings(defaults: defaults)
        store.setHideAmounts(true)
        XCTAssertTrue(store.hideAmounts)
        XCTAssertTrue(UserDefaults.standard.bool(forKey: PrivacySettings.hideAmountsKey))
        XCTAssertEqual(WidgetAppGroup.defaults?.bool(forKey: PrivacySettings.hideAmountsKey), true)
        store.setHideAmounts(false)
        XCTAssertFalse(store.hideAmounts)
        XCTAssertFalse(UserDefaults.standard.bool(forKey: PrivacySettings.hideAmountsKey))
        XCTAssertEqual(WidgetAppGroup.defaults?.bool(forKey: PrivacySettings.hideAmountsKey), false)
    }

    func testSetAppLockPersistsLocally() {
        let store = PrivacySettings(defaults: defaults)
        store.setAppLockEnabled(true)
        XCTAssertTrue(store.appLockEnabled)
        XCTAssertTrue(UserDefaults.standard.bool(forKey: PrivacySettings.appLockKey))
        store.setAppLockEnabled(false)
        XCTAssertFalse(store.appLockEnabled)
        XCTAssertFalse(UserDefaults.standard.bool(forKey: PrivacySettings.appLockKey))
    }

    func testInitReadsStoredAppLockFromInjectedDefaults() {
        defaults.set(true, forKey: PrivacySettings.appLockKey)
        let store = PrivacySettings(defaults: defaults)
        XCTAssertTrue(store.appLockEnabled)
        XCTAssertFalse(store.hideAmounts)
    }

    func testInitPicksUpMaskFromAppGroup() {
        WidgetAppGroup.defaults?.set(true, forKey: PrivacySettings.hideAmountsKey)
        let store = PrivacySettings(defaults: defaults)
        XCTAssertTrue(store.hideAmounts)
    }
}
