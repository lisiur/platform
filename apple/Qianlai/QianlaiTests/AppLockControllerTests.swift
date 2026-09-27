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
    /// the blur curtain rises WITHOUT locking, and a round trip back to
    /// active lifts it — no auth, the auto-prompt never armed.
    func testInactiveShowsCurtainWithoutLocking() {
        let controller = AppLockController(authenticate: { true })
        controller.handleSceneChange(.inactive, lockEnabled: true, curtainEnabled: true, isLoggedIn: true)
        XCTAssertEqual(controller.shieldMode, .curtain)
        XCTAssertFalse(controller.isLocked)
        controller.handleSceneChange(.active, lockEnabled: true, curtainEnabled: true, isLoggedIn: true)
        XCTAssertEqual(controller.shieldMode, .hidden)
    }

    /// With only 隐藏金额 on (应用锁 off), the curtain still covers the
    /// card — but backgrounding never locks, and returning lifts.
    func testCurtainOnlyModeBlursWithoutLocking() {
        let controller = AppLockController(authenticate: { true })
        controller.handleSceneChange(.inactive, lockEnabled: false, curtainEnabled: true, isLoggedIn: true)
        XCTAssertEqual(controller.shieldMode, .curtain)
        XCTAssertFalse(controller.isLocked)
        controller.handleSceneChange(.background, lockEnabled: false, curtainEnabled: true, isLoggedIn: true)
        XCTAssertEqual(controller.shieldMode, .curtain)
        XCTAssertFalse(controller.isLocked)
        controller.handleSceneChange(.active, lockEnabled: false, curtainEnabled: true, isLoggedIn: true)
        XCTAssertEqual(controller.shieldMode, .hidden)
    }

    /// The auth dialog's own deactivation lands as `.inactive` while the
    /// lock is up — it must not swap the lock shield for the curtain.
    func testInactiveWhileLockedStaysLocked() {
        let controller = AppLockController(authenticate: { true })
        controller.handleSceneChange(.background, lockEnabled: true, curtainEnabled: false, isLoggedIn: true)
        controller.handleSceneChange(.inactive, lockEnabled: true, curtainEnabled: false, isLoggedIn: true)
        XCTAssertEqual(controller.shieldMode, .lock)
        XCTAssertTrue(controller.isLocked)
    }

    func testBackgroundingLocksWhenEnabledAndLoggedIn() {
        let controller = AppLockController(authenticate: { true })
        controller.handleSceneChange(.inactive, lockEnabled: true, curtainEnabled: false, isLoggedIn: true)
        XCTAssertFalse(controller.isLocked)
        controller.handleSceneChange(.background, lockEnabled: true, curtainEnabled: false, isLoggedIn: true)
        XCTAssertTrue(controller.isLocked)
    }

    func testStaysUnlockedWhenDisabledOrLoggedOut() {
        let controller = AppLockController(authenticate: { true })
        controller.handleSceneChange(.background, lockEnabled: false, curtainEnabled: false, isLoggedIn: true)
        XCTAssertFalse(controller.isLocked)
        controller.handleSceneChange(.background, lockEnabled: true, curtainEnabled: false, isLoggedIn: false)
        XCTAssertFalse(controller.isLocked)
    }

    func testDisablingReleasesAnArmedLock() {
        let controller = AppLockController(authenticate: { true })
        controller.handleSceneChange(.background, lockEnabled: true, curtainEnabled: false, isLoggedIn: true)
        XCTAssertTrue(controller.isLocked)
        controller.handleSceneChange(.background, lockEnabled: false, curtainEnabled: false, isLoggedIn: true)
        XCTAssertFalse(controller.isLocked)
    }

    func testUnlockClearsLockOnSuccess() async {
        let controller = AppLockController(authenticate: { true })
        controller.handleSceneChange(.background, lockEnabled: true, curtainEnabled: false, isLoggedIn: true)
        await controller.unlock()
        XCTAssertFalse(controller.isLocked)
    }

    func testUnlockKeepsLockOnFailure() async {
        let controller = AppLockController(authenticate: { false })
        controller.handleSceneChange(.background, lockEnabled: true, curtainEnabled: false, isLoggedIn: true)
        await controller.unlock()
        XCTAssertTrue(controller.isLocked)
    }

    func testReturningToActiveAttemptsUnlock() async {
        let controller = AppLockController(authenticate: { true })
        controller.handleSceneChange(.background, lockEnabled: true, curtainEnabled: false, isLoggedIn: true)
        XCTAssertTrue(controller.isLocked)
        controller.handleSceneChange(.active, lockEnabled: true, curtainEnabled: false, isLoggedIn: true)
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
        controller.handleSceneChange(.background, lockEnabled: true, curtainEnabled: false, isLoggedIn: true)
        controller.handleSceneChange(.active, lockEnabled: true, curtainEnabled: false, isLoggedIn: true)
        await Self.drainUnlock(of: controller)
        // The dialog-dismissal bounce (its own inactive + active): still
        // locked, no second prompt.
        XCTAssertTrue(controller.isLocked)
        controller.handleSceneChange(.inactive, lockEnabled: true, curtainEnabled: false, isLoggedIn: true)
        controller.handleSceneChange(.active, lockEnabled: true, curtainEnabled: false, isLoggedIn: true)
        await Self.drainUnlock(of: controller)
        let bouncedAttempts = await attempts.count
        XCTAssertEqual(bouncedAttempts, 1)
        // Manual retry evaluates.
        await controller.unlock()
        let retriedAttempts = await attempts.count
        XCTAssertEqual(retriedAttempts, 2)
        // A new lock event re-arms the one-shot auto-prompt.
        controller.handleSceneChange(.background, lockEnabled: true, curtainEnabled: false, isLoggedIn: true)
        controller.handleSceneChange(.active, lockEnabled: true, curtainEnabled: false, isLoggedIn: true)
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
