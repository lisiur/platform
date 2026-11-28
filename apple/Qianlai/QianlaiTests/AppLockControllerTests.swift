//
//  AppLockControllerTests.swift
//  QianlaiTests
//
//  Created by Lisiur Day on 2026/9/26.
//

import XCTest
@testable import Qianlai

@MainActor
final class AppLockControllerTests: XCTestCase {
    /// Control Center and the app switcher hold the scene at `.inactive`:
    /// with 隐藏金额 on the blur curtain rises WITHOUT locking, and a round
    /// trip back to active lifts it — no auth, the auto-prompt never
    /// armed.
    func testInactiveShowsCurtainWithoutLocking() {
        let controller = AppLockController(authenticate: { true })
        controller.handleSceneChange(.inactive, lockEnabled: true, curtainEnabled: true)
        XCTAssertEqual(controller.shieldMode, .curtain)
        XCTAssertFalse(controller.isLocked)
        controller.handleSceneChange(.active, lockEnabled: true, curtainEnabled: true)
        XCTAssertEqual(controller.shieldMode, .hidden)
    }

    /// With only 隐藏金额 on (应用锁 off), the curtain still covers the
    /// card — but backgrounding never locks, and returning lifts.
    func testCurtainOnlyModeBlursWithoutLocking() {
        let controller = AppLockController(authenticate: { true })
        controller.handleSceneChange(.inactive, lockEnabled: false, curtainEnabled: true)
        XCTAssertEqual(controller.shieldMode, .curtain)
        XCTAssertFalse(controller.isLocked)
        controller.handleSceneChange(.background, lockEnabled: false, curtainEnabled: true)
        XCTAssertEqual(controller.shieldMode, .curtain)
        XCTAssertFalse(controller.isLocked)
        controller.handleSceneChange(.active, lockEnabled: false, curtainEnabled: true)
        XCTAssertEqual(controller.shieldMode, .hidden)
    }

    /// The curtain is 隐藏金额's alone: 应用锁 by itself locks on
    /// backgrounding but leaves a Control Center / switcher pull
    /// unblurred, and shields nothing at `.inactive`.
    func testInactiveDoesNotCurtainWhenHideAmountsOff() {
        let controller = AppLockController(authenticate: { true })
        controller.handleSceneChange(.inactive, lockEnabled: true, curtainEnabled: false)
        XCTAssertEqual(controller.shieldMode, .hidden)
        XCTAssertFalse(controller.isLocked)
        // Still a lock, one phase later.
        controller.handleSceneChange(.background, lockEnabled: true, curtainEnabled: false)
        XCTAssertTrue(controller.isLocked)
    }

    /// Both toggles off — or the app lock on while logged out, which can't
    /// lock — is the plain pre-privacy app: nothing covers it, on any
    /// phase.
    /// No toggles → no shield at all; the lock toggle alone arms the lock
    /// (login plays no part — see `testLockArmsRegardlessOfLoginState`).
    func testNoToggleMeansNoShieldAtAll() {
        let controller = AppLockController(authenticate: { true })
        controller.handleSceneChange(.inactive, lockEnabled: false, curtainEnabled: false)
        XCTAssertEqual(controller.shieldMode, .hidden)
        controller.handleSceneChange(.background, lockEnabled: true, curtainEnabled: false)
        XCTAssertTrue(controller.isLocked)
    }

    /// The auth dialog's own deactivation lands as `.inactive` while the
    /// lock is up — with the curtain off, nothing but the lock's own
    /// shield state can keep it from swapping for the curtain.
    func testInactiveWhileLockedStaysLocked() {
        let controller = AppLockController(authenticate: { true })
        controller.handleSceneChange(.background, lockEnabled: true, curtainEnabled: false)
        controller.handleSceneChange(.inactive, lockEnabled: true, curtainEnabled: false)
        XCTAssertEqual(controller.shieldMode, .lock)
        XCTAssertTrue(controller.isLocked)
    }

    func testBackgroundingLocksWhenEnabledAndLoggedIn() {
        let controller = AppLockController(authenticate: { true })
        controller.handleSceneChange(.inactive, lockEnabled: true, curtainEnabled: false)
        XCTAssertFalse(controller.isLocked)
        controller.handleSceneChange(.background, lockEnabled: true, curtainEnabled: false)
        XCTAssertTrue(controller.isLocked)
    }

    /// A 应用锁 toggle-off racing an armed lock falls back to the curtain
    /// when 隐藏金额 still hides amounts — never to a bare, readable card.
    func testDisablingLockFallsBackToCurtainWhileAmountsHidden() {
        let controller = AppLockController(authenticate: { true })
        controller.handleSceneChange(.background, lockEnabled: true, curtainEnabled: true)
        XCTAssertTrue(controller.isLocked)
        controller.handleSceneChange(.background, lockEnabled: false, curtainEnabled: true)
        XCTAssertFalse(controller.isLocked)
        XCTAssertEqual(controller.shieldMode, .curtain)
    }

    /// With both toggles off the released lock goes all the way down — the
    /// curtain is 隐藏金额's to raise, not the lock's consolation prize.
    func testDisablingReleasesAnArmedLock() {
        let controller = AppLockController(authenticate: { true })
        controller.handleSceneChange(.background, lockEnabled: true, curtainEnabled: false)
        XCTAssertTrue(controller.isLocked)
        controller.handleSceneChange(.background, lockEnabled: false, curtainEnabled: false)
        XCTAssertFalse(controller.isLocked)
        XCTAssertEqual(controller.shieldMode, .hidden)
    }

    /// F9: the lock no longer keys on login — the app lock is device
    /// privacy, and signed-out use (local ledgers) is exactly the scenario
    /// it must cover. The controller doesn't even know login exists.
    func testLockArmsRegardlessOfLoginState() {
        let controller = AppLockController(authenticate: { true })
        controller.handleSceneChange(.background, lockEnabled: false, curtainEnabled: false)
        XCTAssertFalse(controller.isLocked)
        controller.handleSceneChange(.background, lockEnabled: true, curtainEnabled: false)
        XCTAssertTrue(controller.isLocked, "应用锁在未登录态照常可用")
    }

    func testUnlockClearsLockOnSuccess() async {
        let controller = AppLockController(authenticate: { true })
        controller.handleSceneChange(.background, lockEnabled: true, curtainEnabled: false)
        await controller.unlock()
        XCTAssertFalse(controller.isLocked)
    }

    func testUnlockKeepsLockOnFailure() async {
        let controller = AppLockController(authenticate: { false })
        controller.handleSceneChange(.background, lockEnabled: true, curtainEnabled: false)
        await controller.unlock()
        XCTAssertTrue(controller.isLocked)
    }

    func testReturningToActiveAttemptsUnlock() async {
        let controller = AppLockController(authenticate: { true })
        controller.handleSceneChange(.background, lockEnabled: true, curtainEnabled: false)
        XCTAssertTrue(controller.isLocked)
        controller.handleSceneChange(.active, lockEnabled: true, curtainEnabled: false)
        await Self.drainUnlock(of: controller)
        XCTAssertFalse(controller.isLocked)
    }

    /// Cancelling must not loop: the auth dialog's own dismissal lands as
    /// an `.active`, and the auto-prompt is one-shot per lock event — the
    /// bounced transition re-prompts nothing. Manual unlock and a new lock
    /// event still evaluate.
    func testCancelledAutoUnlockDoesNotRepromptOnNextActive() async {
        let attempts = AttemptCounter()
        let controller = AppLockController(authenticate: {
            await attempts.bump()
            return false
        })
        controller.handleSceneChange(.background, lockEnabled: true, curtainEnabled: false)
        controller.handleSceneChange(.active, lockEnabled: true, curtainEnabled: false)
        await Self.drainUnlock(of: controller)
        // The dialog-dismissal bounce (its own inactive + active): still
        // locked, no second prompt.
        XCTAssertTrue(controller.isLocked)
        controller.handleSceneChange(.inactive, lockEnabled: true, curtainEnabled: false)
        controller.handleSceneChange(.active, lockEnabled: true, curtainEnabled: false)
        await Self.drainUnlock(of: controller)
        let bouncedAttempts = await attempts.count
        XCTAssertEqual(bouncedAttempts, 1)
        // Manual retry evaluates.
        await controller.unlock()
        let retriedAttempts = await attempts.count
        XCTAssertEqual(retriedAttempts, 2)
        // A new lock event re-arms the one-shot auto-prompt.
        controller.handleSceneChange(.background, lockEnabled: true, curtainEnabled: false)
        controller.handleSceneChange(.active, lockEnabled: true, curtainEnabled: false)
        await Self.drainUnlock(of: controller)
        let reArmedAttempts = await attempts.count
        XCTAssertEqual(reArmedAttempts, 3)
    }

    func testLockAtLaunchArmsAndEvaluates() async {
        let controller = AppLockController(authenticate: { true })
        controller.lockAtLaunch()
        XCTAssertTrue(controller.isLocked)
        await Self.drainUnlock(of: controller)
        XCTAssertFalse(controller.isLocked)
    }

    /// The auto-unlock spawns an unstructured task on the main actor; the
    /// test drains it by yielding while the lock is still armed (bounded,
    /// so a controller that never unlocks fails the assert instead of the
    /// loop).
    private static func drainUnlock(of controller: AppLockController) async {
        for _ in 0..<100 where controller.isLocked {
            await Task.yield()
        }
    }
}

/// Evaluation-attempt counter for the cancel-loop regression test — an
/// actor because the `@Sendable` authenticate closure can't mutate a
/// captured local.
private actor AttemptCounter {
    private(set) var count = 0
    func bump() { count += 1 }
}
