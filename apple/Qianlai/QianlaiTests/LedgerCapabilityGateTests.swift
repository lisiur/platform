//
//  LedgerCapabilityGateTests.swift
//  QianlaiTests
//
//  The C7 capability matrix and the C9 scoped sign-out sweeps: the F9
//  rule set pinned as fixtures — signed out strips everything
//  server-backed, local ledgers never surface cloud entries, the upgrade
//  entry degrades to login-first, and the sweeps spare local data.
//

import XCTest
@testable import Qianlai

final class LedgerCapabilityGateTests: XCTestCase {
    private func ledger(storage: LedgerStorage, role: LedgerRole = .owner) -> QianlaiLedger {
        QianlaiLedger(
            id: "l1", ownerId: "u1", name: "账本", description: nil, currency: "CNY",
            status: "active", isDefault: false, createdAt: Date(), updatedAt: Date(),
            myRole: role, membersCount: 1, shared: false, storage: storage
        )
    }

    // MARK: - C7 matrix

    func testSignedOutStripsEverythingServerBacked() {
        let capabilities = LedgerCapabilityGate.capabilities(isLoggedIn: false, ledger: ledger(storage: .cloud))
        XCTAssertFalse(capabilities.canRecognize)
        XCTAssertFalse(capabilities.canManageMembers)
        XCTAssertFalse(capabilities.canUseServerTransfer)
        XCTAssertFalse(capabilities.canSyncPreferences)
        XCTAssertFalse(capabilities.showsUpgradeEntry)
        XCTAssertTrue(capabilities.showsLoginEntry, "登录入口常驻「我的」")
        XCTAssertFalse(capabilities.showsSignedOutEmptyState, "有账本时不给空态三落点")
    }

    func testSignedOutLocalLedgerKeepsUpgradeEntryDegraded() {
        let capabilities = LedgerCapabilityGate.capabilities(isLoggedIn: false, ledger: ledger(storage: .local))
        XCTAssertFalse(capabilities.canRecognize)
        XCTAssertFalse(capabilities.canManageMembers)
        XCTAssertFalse(capabilities.canUseServerTransfer)
        XCTAssertTrue(capabilities.showsUpgradeEntry, "升级入口可见")
        XCTAssertTrue(capabilities.upgradeRequiresLogin, "未登录发起升级先引导登录 (AC9.3)")
        XCTAssertTrue(capabilities.showsLoginEntry)
    }

    func testLocalLedgerHidesAllServerCapabilities() {
        let capabilities = LedgerCapabilityGate.capabilities(isLoggedIn: true, ledger: ledger(storage: .local))
        XCTAssertFalse(capabilities.canRecognize, "AI 识图/语音入口不出现 (AC4.2)")
        XCTAssertFalse(capabilities.canManageMembers, "成员/邀请/角色入口不出现 (AC4.2)")
        XCTAssertFalse(capabilities.canUseServerTransfer, "服务端导出入口不出现 (AC4.2)")
        XCTAssertTrue(capabilities.showsUpgradeEntry)
        XCTAssertFalse(capabilities.upgradeRequiresLogin, "已登录升级不再拦截")
        XCTAssertFalse(capabilities.showsLoginEntry)
    }

    func testCloudLedgerKeepsBaseline() {
        let capabilities = LedgerCapabilityGate.capabilities(isLoggedIn: true, ledger: ledger(storage: .cloud))
        XCTAssertTrue(capabilities.canRecognize)
        XCTAssertTrue(capabilities.canManageMembers)
        XCTAssertTrue(capabilities.canUseServerTransfer)
        XCTAssertTrue(capabilities.canSyncPreferences)
        XCTAssertFalse(capabilities.showsUpgradeEntry)
        // Guests already lose recognition through the ledger's own rule.
        let guest = LedgerCapabilityGate.capabilities(isLoggedIn: true, ledger: ledger(storage: .cloud, role: .guest))
        XCTAssertFalse(guest.canRecognize)
        XCTAssertTrue(guest.canManageMembers, "成员 tab 在访客下仍可见（角色限制动作）")
    }

    func testNilLedgerSignedOutShowsEmptyStateTrio() {
        let capabilities = LedgerCapabilityGate.capabilities(isLoggedIn: false, ledger: nil)
        XCTAssertTrue(capabilities.showsSignedOutEmptyState, "未登录且无账本 → 首页三落点 (AC9.5)")
        XCTAssertTrue(capabilities.showsLoginEntry)
        let signedIn = LedgerCapabilityGate.capabilities(isLoggedIn: true, ledger: nil)
        XCTAssertFalse(signedIn.showsSignedOutEmptyState)
    }

    // MARK: - C9 sweeps

    func testWidgetDataScopedSweepKeepsLocalContext() throws {
        let defaults = UserDefaults(suiteName: "WidgetDataScopedSweepTests")!
        defaults.removePersistentDomain(forName: "WidgetDataScopedSweepTests")
        let localLedger = ledger(storage: .local)
        let cloudLedger = QianlaiLedger(
            id: "cloud-1", ownerId: "u1", name: "云", description: nil, currency: "CNY",
            status: "active", isDefault: false, createdAt: Date(), updatedAt: Date(),
            myRole: .owner, membersCount: 1, shared: false, storage: .cloud
        )

        // Local active + local snapshot: the mirror and snapshot survive.
        WidgetDataStore.saveActiveLedger(localLedger, defaults: defaults)
        WidgetDataStore.saveActiveLedgerId(localLedger.id, defaults: defaults)
        WidgetDataStore.saveLocalSnapshot(
            WidgetSnapshot(
                ledgerId: localLedger.id, monthYear: 2026, monthMonth: 1,
                totalIncome: 1, totalExpense: 2, net: -1,
                recentEntries: [], generatedAt: Date()
            ),
            defaults: defaults
        )
        WidgetDataStore.saveScopedProject(
            WidgetScopedProject(id: "p", ledgerId: "cloud-1", name: "项目"),
            defaults: defaults
        )
        WidgetDataStore.clearCloudScoped(defaults: defaults)
        XCTAssertEqual(WidgetDataStore.loadActiveLedger(defaults: defaults)?.id, localLedger.id)
        XCTAssertEqual(WidgetDataStore.loadSnapshot(defaults: defaults)?.ledgerId, localLedger.id)
        XCTAssertNil(WidgetDataStore.loadScopedProject(defaults: defaults), "cloud-only extras drop")

        // Cloud active: today's full sweep — nothing survives.
        WidgetDataStore.saveActiveLedger(cloudLedger, defaults: defaults)
        WidgetDataStore.saveActiveLedgerId(cloudLedger.id, defaults: defaults)
        WidgetDataStore.clearCloudScoped(defaults: defaults)
        XCTAssertNil(WidgetDataStore.loadActiveLedger(defaults: defaults))
        XCTAssertNil(WidgetDataStore.loadSnapshot(defaults: defaults), "cloud snapshot gone with the session")
    }

    func testSnapshotCacheScopedSweepSparesLocalLedgers() {
        let defaults = UserDefaults(suiteName: "SnapshotCacheScopedSweepTests")!
        defaults.removePersistentDomain(forName: "SnapshotCacheScopedSweepTests")
        struct Sample: Codable, Equatable { var value: Int }

        SnapshotCache.write("journal", key: "local-uuid|all|all", schema: 1, payload: Sample(value: 1), defaults: defaults)
        SnapshotCache.write("journal", key: "cloud-cuid|all|all", schema: 1, payload: Sample(value: 2), defaults: defaults)

        SnapshotCache.clearCloudScoped(localLedgerIds: ["local-uuid"], defaults: defaults)
        let kept: Sample? = SnapshotCache.read("journal", key: "local-uuid|all|all", schema: 1, as: Sample.self, defaults: defaults)
        let swept: Sample? = SnapshotCache.read("journal", key: "cloud-cuid|all|all", schema: 1, as: Sample.self, defaults: defaults)
        XCTAssertEqual(kept, Sample(value: 1), "local-ledger caches survive logout (AC9.2)")
        XCTAssertNil(swept, "cloud caches go with the session")

        // Empty registry: the safe default is the full sweep.
        SnapshotCache.write("reports", key: "x", schema: 1, payload: Sample(value: 3), defaults: defaults)
        SnapshotCache.clearCloudScoped(localLedgerIds: [], defaults: defaults)
        let fullySwept: Sample? = SnapshotCache.read("reports", key: "x", schema: 1, as: Sample.self, defaults: defaults)
        XCTAssertNil(fullySwept)
    }
}
