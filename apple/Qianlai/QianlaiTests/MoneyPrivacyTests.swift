//
//  MoneyPrivacyTests.swift
//  QianlaiTests
//
//  Created by Lisiur Day on 2026/9/26.
//

import XCTest
@testable import Qianlai

final class MoneyPrivacyTests: XCTestCase {
    override func setUp() {
        super.setUp()
        PrivacyFixtures.clearAmountMaskKeys()
    }

    override func tearDown() {
        PrivacyFixtures.clearAmountMaskKeys()
        super.tearDown()
    }

    func testFormatRendersAmountsWhenPrivacyOff() {
        XCTAssertEqual(Money.format(42.5, currency: "CNY"), "¥42.50")
        XCTAssertEqual(Money.format(42.5), "42.50")
        XCTAssertEqual(Money.format(cents: 4210, currency: "CNY"), "¥42.10")
        XCTAssertEqual(Money.format(cents: nil, currency: "CNY"), "—")
    }

    func testFormatMasksWhenAppGroupFlagSet() {
        WidgetAppGroup.defaults?.set(true, forKey: PrivacySettings.hideAmountsKey)
        XCTAssertEqual(Money.format(42.5, currency: "CNY"), "¥***")
        XCTAssertEqual(Money.format(42.5), "***")
        XCTAssertEqual(Money.format(cents: 4210, currency: "CNY"), "¥***")
    }

    func testFormatMasksWhenStandardFlagSet() {
        UserDefaults.standard.set(true, forKey: PrivacySettings.hideAmountsKey)
        XCTAssertEqual(Money.format(42.5, currency: "CNY"), "¥***")
        XCTAssertEqual(Money.format(42.5), "***")
    }

    func testMaskDropsSignAndKeepsNilPlaceholder() {
        UserDefaults.standard.set(true, forKey: PrivacySettings.hideAmountsKey)
        XCTAssertEqual(Money.format(-42.5, currency: "CNY"), "¥***")
        XCTAssertEqual(Money.format(cents: nil, currency: "CNY"), "—")
    }
}
