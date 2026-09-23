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

    func testStatsTabRoundTripsFromConfig() {
        store.configuredTabs = [.journal, .stats]
        XCTAssertEqual(
            store.visibleTabs(isGuest: false, isProjectScoped: false),
            [.dashboard, .journal, .stats, .profile]
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
            [.journal, .stats, .members, .assets, .projects, .reports]
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

    // MARK: - Chip cache (launch without flicker)

    func testSeedsChipFieldsFromCache() {
        defaults.set(
            ["l1": ["memo", "time"]],
            forKey: "qianlai.preferences.ledger.quickEntry.chipFields"
        )
        defaults.set(
            ["p1": ["project"]],
            forKey: "qianlai.preferences.project.quickEntry.chipFields"
        )
        let launched = PreferenceStore(defaults: defaults)
        XCTAssertEqual(launched.ledgerChipFields["l1"], [.memo, .time])
        XCTAssertEqual(launched.projectChipFields["p1"], [.project])
        XCTAssertEqual(
            launched.quickEntryLayout(ledgerId: "l1", projectId: nil),
            QuickEntryLayout(chipFields: [.memo, .time])
        )
        XCTAssertEqual(
            launched.quickEntryLayout(ledgerId: "l1", projectId: "p1"),
            QuickEntryLayout(chipFields: [.project])
        )
    }

    func testCachedChipFieldsDropUnknownValues() {
        // A newer client's field raw value is dropped on read — the same
        // rule the server payload gets — and the rest of the list survives.
        defaults.set(
            ["l1": ["memo", "dragon"]],
            forKey: "qianlai.preferences.ledger.quickEntry.chipFields"
        )
        XCTAssertEqual(PreferenceStore(defaults: defaults).ledgerChipFields["l1"], [.memo])
    }

    func testEmptyChipListSurvivesTheCache() {
        // An empty list IS the config (every field lives in the more sheet)
        // — the mirror must not collapse it into "absent".
        defaults.set(["l1": []], forKey: "qianlai.preferences.ledger.quickEntry.chipFields")
        let launched = PreferenceStore(defaults: defaults)
        XCTAssertEqual(
            launched.quickEntryLayout(ledgerId: "l1", projectId: nil),
            QuickEntryLayout(chipFields: [])
        )
    }

    func testChipMutationsMirrorIntoCache() {
        store.ledgerChipFields["l1"] = [.account, .budget]
        store.projectChipFields["p1"] = []
        XCTAssertEqual(
            defaults.dictionary(forKey: "qianlai.preferences.ledger.quickEntry.chipFields")
                as? [String: [String]],
            ["l1": ["account", "budget"]]
        )
        XCTAssertEqual(
            defaults.dictionary(forKey: "qianlai.preferences.project.quickEntry.chipFields")
                as? [String: [String]],
            ["p1": []]
        )
        // Dropping a scope's config (the restore path assigns nil) empties
        // the mirror — the next launch reads "absent" and falls back to
        // `.standard`.
        store.ledgerChipFields["l1"] = nil
        XCTAssertNil(
            defaults.dictionary(forKey: "qianlai.preferences.ledger.quickEntry.chipFields")
        )
    }

    func testApplyReplacesMirroredChipScopes() {
        store.ledgerChipFields["l1"] = [.memo]
        store.apply(UserPreferencesResponse(
            user: nil,
            ledgers: ["l2": QuickEntryPreference(quickEntry: .init(chipFields: ["time"]))],
            projects: [:]
        ))
        // The apply is a wholesale replacement — a scope the server no
        // longer returns must not haunt the mirror.
        XCTAssertEqual(
            defaults.dictionary(forKey: "qianlai.preferences.ledger.quickEntry.chipFields")
                as? [String: [String]],
            ["l2": ["time"]]
        )
    }

    func testApplyRoundTripsToANewInstance() {
        store.apply(UserPreferencesResponse(
            user: nil,
            ledgers: ["l1": QuickEntryPreference(quickEntry: .init(chipFields: ["memo", "time"]))],
            projects: ["p1": QuickEntryPreference(quickEntry: .init(chipFields: []))]
        ))
        let launched = PreferenceStore(defaults: defaults)
        XCTAssertEqual(
            launched.quickEntryLayout(ledgerId: "l1", projectId: nil),
            QuickEntryLayout(chipFields: [.memo, .time])
        )
        // An empty list from the server stays meaningful through the
        // mirror — it must not collapse into "absent".
        XCTAssertEqual(
            launched.quickEntryLayout(ledgerId: "l1", projectId: "p1"),
            QuickEntryLayout(chipFields: [])
        )
    }

    func testRestoredScopeFallsBackToStandardOnNextLaunch() {
        // `restoreChipFields` itself needs the network, so the test drives
        // the same state change it performs offline (the nil assignment;
        // the didSet is what persists) — the scope drops from the mirror
        // and the next launch reads "absent", falling back to `.standard`.
        store.ledgerChipFields["l1"] = [.memo]
        store.ledgerChipFields["l1"] = nil
        XCTAssertEqual(
            PreferenceStore(defaults: defaults).quickEntryLayout(ledgerId: "l1", projectId: nil),
            .standard
        )
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

        let toggles = try JSONEncoder().encode(UpdateQuickEntryBody(
            quickEntry: .init(chipFields: [.countsInLedger, .budget])
        ))
        let toggleObject = try JSONSerialization.jsonObject(with: toggles) as? [String: [String: [String]]]
        XCTAssertEqual(toggleObject?["quickEntry"]?["chipFields"], ["countsInLedger", "budget"])
    }
}
