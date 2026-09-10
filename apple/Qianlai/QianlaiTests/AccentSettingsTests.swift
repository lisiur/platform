//
//  AccentSettingsTests.swift
//  QianlaiTests
//

import XCTest
@testable import Qianlai

@MainActor
final class AccentSettingsTests: XCTestCase {
    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: AccentSettings.storageKey)
        WidgetAppGroup.defaults?.removeObject(forKey: AccentSettings.storageKey)
        super.tearDown()
    }

    /// With nothing stored the accent is the red default, both through the
    /// observable store and the widget-facing resolver.
    func testDefaultIsRed() {
        UserDefaults.standard.removeObject(forKey: AccentSettings.storageKey)
        WidgetAppGroup.defaults?.removeObject(forKey: AccentSettings.storageKey)

        XCTAssertEqual(AccentSettings().accent, .red)
        XCTAssertEqual(AppAccent.stored(), .red)
    }

    /// set persists across instances and mirrors into the App Group suite —
    /// the widget (whose standard defaults are empty) resolves the same
    /// choice from the mirror alone.
    func testSetPersistsAndMirrorsToWidgetSuite() {
        let settings = AccentSettings()
        settings.set(.indigo)

        XCTAssertEqual(AccentSettings().accent, .indigo)
        XCTAssertEqual(UserDefaults.standard.string(forKey: AccentSettings.storageKey), "indigo")

        // Widget-side read: the process standard is bypassed by removing it,
        // so only the App Group mirror can answer.
        UserDefaults.standard.removeObject(forKey: AccentSettings.storageKey)
        XCTAssertEqual(AppAccent.stored(), .indigo)
    }

    /// A raw value from an older or newer build falls back to red instead
    /// of crashing or rendering blue.
    func testUnknownStoredValueFallsBackToRed() {
        UserDefaults.standard.set("chartreuse", forKey: AccentSettings.storageKey)
        XCTAssertEqual(AccentSettings().accent, .red)
    }

    /// Every preset carries a unique raw value, so the persisted string
    /// always round-trips to the swatch that wrote it.
    func testPresetRawValuesAreUnique() {
        let rawValues = AppAccent.allCases.map(\.rawValue)
        XCTAssertEqual(Set(rawValues).count, rawValues.count)
    }
}
