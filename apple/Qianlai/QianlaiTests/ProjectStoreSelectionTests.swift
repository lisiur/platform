//
//  ProjectStoreSelectionTests.swift
//  QianlaiTests
//
//  Created by Lisiur Day on 2026/9/11.
//

import XCTest
@testable import Qianlai

@MainActor
final class ProjectStoreSelectionTests: XCTestCase {
    private var defaults: UserDefaults!

    override func setUp() async throws {
        try await super.setUp()
        // A throwaway suite per test: the store seeds the selection from
        // persisted state, so tests must not see each other's (or the
        // host's) choice.
        let suite = "ProjectStoreSelectionTests"
        UserDefaults.standard.removePersistentDomain(forName: suite)
        defaults = UserDefaults(suiteName: suite)
    }

    func testInitRestoresPersistedSelection() {
        defaults.set("project-a", forKey: "qianlai.selectedProjectId")
        let store = ProjectStore(defaults: defaults)
        XCTAssertEqual(store.selectedProjectId, "project-a")
    }

    func testInitWithoutPersistedSelectionIsNil() {
        let store = ProjectStore(defaults: defaults)
        XCTAssertNil(store.selectedProjectId)
    }

    func testSelectPersistsSelection() {
        let store = ProjectStore(defaults: defaults)
        store.select("project-a")
        XCTAssertEqual(store.selectedProjectId, "project-a")
        XCTAssertEqual(defaults.string(forKey: "qianlai.selectedProjectId"), "project-a")
    }

    func testSelectNilClearsPersistedSelection() {
        defaults.set("project-a", forKey: "qianlai.selectedProjectId")
        let store = ProjectStore(defaults: defaults)
        store.select(nil)
        XCTAssertNil(store.selectedProjectId)
        XCTAssertNil(defaults.string(forKey: "qianlai.selectedProjectId"))
    }
}
