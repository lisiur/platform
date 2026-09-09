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
    private var defaults: UserDefaults!

    override func setUp() async throws {
        try await super.setUp()
        // A throwaway suite per test: the store seeds from persisted tabs,
        // so tests must not see each other's (or the host's) cache.
        let suite = "PreferenceStoreTests"
        UserDefaults.standard.removePersistentDomain(forName: suite)
        defaults = UserDefaults(suiteName: suite)
        store = PreferenceStore(defaults: defaults)
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

    // MARK: - Tab cache (launch without flicker)

    func testSeedsArrangementFromCache() {
        defaults.set(["reports", "journal"], forKey: "qianlai.preferences.user.tabs")
        let launched = PreferenceStore(defaults: defaults)
        XCTAssertEqual(launched.configuredTabs, [.reports, .journal])
        XCTAssertEqual(
            launched.visibleTabs(isGuest: false, isProjectScoped: false),
            [.dashboard, .reports, .journal, .profile]
        )
    }

    func testCachedArrangementRunsThroughTheSameValidation() {
        // Unknown values dropped, and a survivor count outside the 1–2 rule
        // is discarded wholesale — the same resolution a server payload
        // gets, so a cache written by another client can never surface an
        // arrangement the current rules reject.
        defaults.set(
            ["kindle", "reports", "journal", "members"],
            forKey: "qianlai.preferences.user.tabs"
        )
        XCTAssertNil(PreferenceStore(defaults: defaults).configuredTabs)

        // A single surviving tab still fits the 1–2 rule and is honored.
        defaults.set(["members"], forKey: "qianlai.preferences.user.tabs")
        XCTAssertEqual(
            PreferenceStore(defaults: defaults).configuredTabs,
            [.members]
        )
    }

    func testApplyMirrorsIntoCache() {
        store.apply(UserPreferencesResponse(
            user: TabsPreference(tabs: ["reports", "assets"]),
            ledgers: [:],
            projects: [:]
        ))
        XCTAssertEqual(
            defaults.stringArray(forKey: "qianlai.preferences.user.tabs"),
            ["reports", "assets"]
        )
        // A cleared config must not resurrect on the next launch.
        store.apply(UserPreferencesResponse(user: nil, ledgers: [:], projects: [:]))
        XCTAssertNil(defaults.stringArray(forKey: "qianlai.preferences.user.tabs"))
    }

    func testEveryMutationMirrorsIntoCache() {
        // The optimistic local write (setTabs assigns before its request;
        // a rollback re-assigns the previous value) flows through the same
        // didSet, so the cache can be exercised without network.
        store.configuredTabs = [.projects, .journal]
        XCTAssertEqual(
            defaults.stringArray(forKey: "qianlai.preferences.user.tabs"),
            ["projects", "journal"]
        )
        store.configuredTabs = nil
        XCTAssertNil(defaults.stringArray(forKey: "qianlai.preferences.user.tabs"))
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
