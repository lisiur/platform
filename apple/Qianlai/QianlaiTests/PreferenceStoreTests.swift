//
//  PreferenceStoreTests.swift
//  QianlaiTests
//
//  Created by Lisiur Day on 2026/9/8.
//

import XCTest
@testable import Qianlai

@MainActor
final class PreferenceStoreTests: XCTestCase {
    private var store: PreferenceStore!

    override func setUp() async throws {
        try await super.setUp()
        store = PreferenceStore()
    }

    // MARK: - Tabs

    func testDefaultTabsWithoutConfig() {
        XCTAssertEqual(
            store.visibleTabs(isGuest: false, isProjectScoped: false),
            [.dashboard, .journal, .members, .profile]
        )
    }

    func testConfiguredOrderAndSelectionAreRespected() {
        store.configuredTabs = [.reports, .journal]
        XCTAssertEqual(
            store.visibleTabs(isGuest: false, isProjectScoped: false),
            [.dashboard, .reports, .journal, .profile]
        )
    }

    func testGuestBarIsFixedRegardlessOfConfig() {
        store.configuredTabs = [.projects, .journal]
        XCTAssertEqual(
            store.visibleTabs(isGuest: true, isProjectScoped: false),
            PreferenceStore.fixedTabs
        )
    }

    func testProjectScopedBarIsFixedRegardlessOfConfig() {
        store.configuredTabs = [.reports, .assets]
        XCTAssertEqual(
            store.visibleTabs(isGuest: false, isProjectScoped: true),
            PreferenceStore.fixedTabs
        )
    }

    func testEmptyConfigFallsBackToDefaults() {
        store.configuredTabs = []
        XCTAssertEqual(
            store.visibleTabs(isGuest: false, isProjectScoped: false),
            [.dashboard, .journal, .members, .profile]
        )
    }

    func testOversizedConfigIsClampedToTwo() {
        store.configuredTabs = [.journal, .members, .assets, .projects, .reports]
        XCTAssertEqual(
            store.visibleTabs(isGuest: false, isProjectScoped: false),
            [.dashboard, .journal, .members, .profile]
        )
    }

    func testConfigurableTabsExcludePinnedSlots() {
        XCTAssertEqual(
            Set(AppTab.configurableCases),
            [.journal, .members, .assets, .projects, .reports]
        )
        XCTAssertFalse(AppTab.dashboard.isConfigurable)
        XCTAssertFalse(AppTab.profile.isConfigurable)
        XCTAssertFalse(AppTab.quickAdd.isConfigurable)
    }

    // MARK: - Quick-entry layout

    func testLayoutFallsBackToStandard() {
        XCTAssertEqual(store.quickEntryLayout(ledgerId: "l1", projectId: "p1"), .standard)
        XCTAssertEqual(store.quickEntryLayout(ledgerId: "l1", projectId: nil), .standard)
    }

    func testProjectConfigWinsOverLedger() {
        store.ledgerChipFields["l1"] = [.memo]
        store.projectChipFields["p1"] = [.time]
        XCTAssertEqual(
            store.quickEntryLayout(ledgerId: "l1", projectId: "p1"),
            QuickEntryLayout(chipFields: [.time])
        )
        XCTAssertEqual(
            store.quickEntryLayout(ledgerId: "l1", projectId: nil),
            QuickEntryLayout(chipFields: [.memo])
        )
    }

    func testEmptyChipConfigIsMeaningful() {
        store.projectChipFields["p1"] = []
        XCTAssertEqual(
            store.quickEntryLayout(ledgerId: "l1", projectId: "p1"),
            QuickEntryLayout(chipFields: [])
        )
    }

    // MARK: - Payload mapping

    func testApplyKeepsValidTabsAndDropsUnknownValues() {
        // "kindle" is a future client's tab — dropped; the surviving two
        // fit the 1–2 rule and land in the stored order.
        store.apply(UserPreferencesResponse(
            user: TabsPreference(tabs: ["kindle", "reports", "journal"]),
            ledgers: [:],
            projects: [:]
        ))
        XCTAssertEqual(store.configuredTabs, [.reports, .journal])
    }

    func testApplyInvalidTabCountFallsBackToDefaults() {
        store.apply(UserPreferencesResponse(
            user: TabsPreference(tabs: []),
            ledgers: [:],
            projects: [:]
        ))
        XCTAssertNil(store.configuredTabs)
        XCTAssertEqual(
            store.visibleTabs(isGuest: false, isProjectScoped: false),
            [.dashboard, .journal, .members, .profile]
        )
    }

    func testApplyNullUserClearsConfig() {
        store.configuredTabs = [.assets]
        store.apply(UserPreferencesResponse(user: nil, ledgers: [:], projects: [:]))
        XCTAssertNil(store.configuredTabs)
    }

    func testApplyChipFieldsDropsUnknownFields() {
        store.apply(UserPreferencesResponse(
            user: nil,
            ledgers: ["l1": QuickEntryPreference(quickEntry: .init(chipFields: ["memo", "dragon"]))],
            projects: [:]
        ))
        XCTAssertEqual(store.ledgerChipFields["l1"], [.memo])
    }

    // MARK: - Wire format

    func testDecodePreferencesPayload() throws {
        let json = """
        {"user":{"tabs":["journal","members"]},"ledgers":{"l1":{"quickEntry":{"chipFields":["memo"]}}},"projects":{}}
        """
        let response = try JSONDecoder().decode(UserPreferencesResponse.self, from: Data(json.utf8))
        XCTAssertEqual(response.user?.tabs, ["journal", "members"])
        XCTAssertEqual(response.ledgers["l1"]?.quickEntry.chipFields, ["memo"])
        XCTAssertEqual(response.projects, [:])
    }

    func testUpdateTabsBodyEncodesRawValues() throws {
        let data = try JSONEncoder().encode(UpdateTabsBody(tabs: [.journal, .assets]))
        let object = try JSONSerialization.jsonObject(with: data) as? [String: [String]]
        XCTAssertEqual(object, ["tabs": ["journal", "assets"]])
    }

    func testUpdateQuickEntryBodyEncodesRawValues() throws {
        let data = try JSONEncoder().encode(UpdateQuickEntryBody(
            quickEntry: .init(chipFields: [.account, .location])
        ))
        let object = try JSONSerialization.jsonObject(with: data) as? [String: [String: [String]]]
        XCTAssertEqual(object?["quickEntry"]?["chipFields"], ["account", "location"])
    }
}
