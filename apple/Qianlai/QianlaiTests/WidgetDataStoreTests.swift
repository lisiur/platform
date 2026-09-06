//
//  WidgetDataStoreTests.swift
//  QianlaiTests
//
//  Created by Lisiur Day on 2026/9/5.
//

import XCTest
@testable import Qianlai

final class WidgetDataStoreTests: XCTestCase {
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: "WidgetDataStoreTests")
        defaults.removePersistentDomain(forName: "WidgetDataStoreTests")
    }

    private func sampleSnapshot(ledgerId: String = "l1") -> WidgetSnapshot {
        WidgetSnapshot(
            ledgerId: ledgerId,
            assets: 100,
            liabilities: 40,
            netWorth: 60,
            monthYear: 2026,
            monthMonth: 9,
            totalIncome: 500,
            totalExpense: 120.5,
            net: 379.5,
            recentEntries: [],
            generatedAt: Date(timeIntervalSince1970: 1_787_000_000)
        )
    }

    func testSnapshotRoundtrip() {
        XCTAssertNil(WidgetDataStore.loadSnapshot(defaults: defaults))
        let snapshot = sampleSnapshot()
        WidgetDataStore.saveSnapshot(snapshot, defaults: defaults)
        XCTAssertEqual(WidgetDataStore.loadSnapshot(defaults: defaults), snapshot)
    }

    func testActiveLedgerRoundtripAndClear() {
        let ledger = QianlaiLedger(
            id: "l1", ownerId: "u1", name: "现金账本", description: nil,
            currency: "CNY", status: "active", isDefault: true,
            createdAt: Date(timeIntervalSince1970: 0), updatedAt: Date(timeIntervalSince1970: 0),
            myRole: .owner, membersCount: 2, shared: true
        )
        WidgetDataStore.saveActiveLedgerId("l1", defaults: defaults)
        WidgetDataStore.saveActiveLedger(ledger, defaults: defaults)
        XCTAssertEqual(WidgetDataStore.loadActiveLedgerId(defaults: defaults), "l1")
        XCTAssertEqual(WidgetDataStore.loadActiveLedger(defaults: defaults), ledger)

        WidgetDataStore.clearAll(defaults: defaults)
        XCTAssertNil(WidgetDataStore.loadActiveLedgerId(defaults: defaults))
        XCTAssertNil(WidgetDataStore.loadActiveLedger(defaults: defaults))
        XCTAssertNil(WidgetDataStore.loadSnapshot(defaults: defaults))
    }

    func testScopedProjectRoundtripAndClear() {
        XCTAssertNil(WidgetDataStore.loadScopedProject(defaults: defaults))
        let project = WidgetScopedProject(id: "p1", ledgerId: "l1", name: "装修")
        WidgetDataStore.saveScopedProject(project, defaults: defaults)
        XCTAssertEqual(WidgetDataStore.loadScopedProject(defaults: defaults), project)
        WidgetDataStore.saveScopedProject(nil, defaults: defaults)
        XCTAssertNil(WidgetDataStore.loadScopedProject(defaults: defaults))
        // Sign-out cleanup covers the scope mirror too.
        WidgetDataStore.saveScopedProject(project, defaults: defaults)
        WidgetDataStore.clearAll(defaults: defaults)
        XCTAssertNil(WidgetDataStore.loadScopedProject(defaults: defaults))
    }

    func testProjectSnapshotRoundtrip() {
        XCTAssertNil(WidgetDataStore.loadProjectSnapshot(defaults: defaults))
        let report = ProjectReport(
            project: ProjectReportInfo(
                id: "p1", ledgerId: "l1", name: "装修", status: "active",
                startDate: nil, endDate: nil
            ),
            statement: IncomeStatement(
                income: [], expense: [],
                totalIncome: 800, totalExpense: 300.5, net: 499.5
            ),
            settlement: [],
            totals: ProjectReportTotals(entries: 12)
        )
        let snapshot = WidgetProjectSnapshot(
            project: WidgetScopedProject(id: "p1", ledgerId: "l1", name: "装修"),
            report: report
        )
        WidgetDataStore.saveProjectSnapshot(snapshot, defaults: defaults)
        XCTAssertEqual(WidgetDataStore.loadProjectSnapshot(defaults: defaults), snapshot)
    }

    private func makeLedger(
        id: String,
        isDefault: Bool,
        status: String = "active",
        role: LedgerRole
    ) -> QianlaiLedger {
        QianlaiLedger(
            id: id, ownerId: "owner-\(id)", name: id, description: nil,
            currency: "CNY", status: status, isDefault: isDefault,
            createdAt: Date(), updatedAt: Date(), myRole: role,
            membersCount: 1, shared: true
        )
    }

    /// A guest of someone else's ledger must never resolve into a widget
    /// target — its name and stats are invisible to the invited member.
    func testWidgetResolutionSkipsGuestLedgers() {
        let ownerLedger = makeLedger(id: "family", isDefault: true, role: .guest)
        let own = makeLedger(id: "own", isDefault: false, role: .owner)

        // The default flag of the guest ledger must not win the fallback.
        XCTAssertEqual(
            WidgetDataStore.resolveWidgetLedger(from: [ownerLedger, own], storedId: nil)?.id,
            "own"
        )
        // A stored id pointing at a guest ledger is treated as invalid.
        XCTAssertEqual(
            WidgetDataStore.resolveWidgetLedger(from: [ownerLedger, own], storedId: "family")?.id,
            "own"
        )
        // A pure-guest user gets nothing — the widget shows its placeholder.
        XCTAssertNil(WidgetDataStore.resolveWidgetLedger(from: [ownerLedger], storedId: nil))
    }

    func testResolvePrefersStoredThenDefaultThenFirstActive() {
        let archived = QianlaiLedger(
            id: "archived", ownerId: "u1", name: "Archived", description: nil,
            currency: "CNY", status: "archived", isDefault: false,
            createdAt: Date(), updatedAt: Date(), myRole: .owner,
            membersCount: 1, shared: false
        )
        let plain = QianlaiLedger(
            id: "plain", ownerId: "u1", name: "Plain", description: nil,
            currency: "CNY", status: "active", isDefault: false,
            createdAt: Date(), updatedAt: Date(), myRole: .owner,
            membersCount: 1, shared: false
        )
        let def = QianlaiLedger(
            id: "default", ownerId: "u1", name: "Default", description: nil,
            currency: "CNY", status: "active", isDefault: true,
            createdAt: Date(), updatedAt: Date(), myRole: .owner,
            membersCount: 1, shared: false
        )
        let ledgers = [archived, plain, def]

        // Stored id wins even when it is not the default.
        XCTAssertEqual(
            WidgetDataStore.resolveActiveLedger(from: ledgers, storedId: "plain")?.id,
            "plain"
        )
        // Without a stored id: default active, else first active, else any.
        XCTAssertEqual(
            WidgetDataStore.resolveActiveLedger(from: ledgers, storedId: nil)?.id,
            "default"
        )
        XCTAssertEqual(
            WidgetDataStore.resolveActiveLedger(from: [archived], storedId: nil)?.id,
            "archived"
        )
        // A stored id pointing at a deleted ledger falls through the chain.
        XCTAssertEqual(
            WidgetDataStore.resolveActiveLedger(from: ledgers, storedId: "gone")?.id,
            "default"
        )
    }
}
